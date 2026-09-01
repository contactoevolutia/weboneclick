import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes";
import {
  deductStock,
  maxInstallmentsFromCuotas,
} from "@/lib/cart";
import { releaseCuponForVenta } from "@/lib/cupones";
import {
  isMercadoPagoConfigured,
  mercadoPagoPayment,
  mercadoPagoPaymentRefund,
} from "@/lib/mercadopago";
import { sendOrderConfirmationEmail } from "@/lib/order-mail";
import { syncVentaToOdoo } from "@/lib/odoo-venta";
import { prisma } from "@/lib/prisma";

export type MpSyncResult = "approved" | "pending" | "rejected" | "ignored";

export type ManualMpSyncResult = {
  result: MpSyncResult;
  paymentsFound: number;
  applied: Array<{ id: string; status: string; result: MpSyncResult }>;
  message: string;
  odooTriggered: boolean;
};

const MP_TIPOS = ["mercado_pago", "tarjeta"] as const;

/** Mercado Crédito: cuotas sin costo para el comercio; no aplicar tope ni reembolso. */
const MP_CREDITO_METHOD_IDS = new Set([
  "consumer_credits",
  "mercadopago_credits",
  "onboarding_credits",
]);

function isMercadoCreditoPayment(payment: PaymentResponse): boolean {
  const id = String(payment.payment_method_id ?? "")
    .trim()
    .toLowerCase();
  return MP_CREDITO_METHOD_IDS.has(id);
}

function money(n: number | string | { toString(): string } | null | undefined) {
  return Number(n ?? 0);
}

/**
 * Comparar importes en centavos enteros: `Math.abs(a - b) <= 0.01` da falso
 * para diferencias de exactamente 1 centavo (127998.02 - 127998.01 en doubles
 * da 0.0100000000093), y eso dejaba ventas trabadas sin acreditar.
 */
function cents(n: number) {
  return Math.round(n * 100);
}

function almostEqual(a: number, b: number, tolCents = 1) {
  return Math.abs(cents(a) - cents(b)) <= tolCents;
}

/** Contado = 1; cuotas = menor cuotas_max de los productos de la venta. */
async function maxInstallmentsForVentaPago(
  tipoPago: string,
  productIds: number[],
): Promise<number> {
  if (tipoPago === "mercado_pago") return 1;
  const ids = [...new Set(productIds.filter((id) => id > 0))];
  if (ids.length === 0) return 1;
  const rows = await prisma.producto.findMany({
    where: { id_producto: { in: ids } },
    select: { cuotas_max: true },
  });
  return maxInstallmentsFromCuotas(rows.map((r) => r.cuotas_max));
}

/**
 * Si una tarjeta acreditó más cuotas de las permitidas (p. ej. cobro in-store
 * vía QR de la app), reembolsa y no marca la venta como pagada.
 * No aplica a Mercado Crédito (`consumer_credits`, etc.).
 */
async function rejectOverInstallments(opts: {
  payment: PaymentResponse;
  idVenta: number;
  tipoPago: string;
  maxAllowed: number;
  paidInstallments: number;
}): Promise<"rejected"> {
  const { payment, idVenta, maxAllowed, paidInstallments } = opts;
  const transactionId = String(payment.id ?? "").trim();
  const motivo =
    `MP cuotas inválidas: cobrado en ${paidInstallments} cuota(s), ` +
    `máximo permitido ${maxAllowed} (modo ${opts.tipoPago}). Reembolso automático.`;

  console.error("[mp-payment-sync] installments mismatch", {
    idVenta,
    paymentId: transactionId,
    paidInstallments,
    maxAllowed,
  });

  try {
    await mercadoPagoPaymentRefund().total({
      payment_id: payment.id!,
      requestOptions: {
        idempotencyKey: `refund-installments-${transactionId}`,
      },
    });
  } catch (err) {
    console.error("[mp-payment-sync] refund failed", { idVenta, err });
    await prisma.venta
      .update({
        where: { id_venta: idVenta },
        data: {
          odoo_sync_error: `${motivo} (falló el reembolso automático; revisar en MP)`,
        },
      })
      .catch(() => undefined);
    throw new Error(motivo);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.pago.findUnique({
      where: { transaction_id: transactionId },
    });
    if (existing) {
      await tx.pago.update({
        where: { id_pago: existing.id_pago },
        data: {
          estado: "rechazado",
          monto: money(payment.transaction_amount),
        },
      });
    } else {
      const shell = await tx.pago.findFirst({
        where: {
          id_venta: idVenta,
          tipo_pago: { in: [...MP_TIPOS] },
          transaction_id: null,
          estado: { not: "aprobado" },
        },
        orderBy: { id_pago: "asc" },
      });
      if (shell) {
        await tx.pago.update({
          where: { id_pago: shell.id_pago },
          data: {
            estado: "rechazado",
            monto: money(payment.transaction_amount),
            transaction_id: transactionId,
          },
        });
      } else {
        await tx.pago.create({
          data: {
            id_venta: idVenta,
            tipo_pago: opts.tipoPago,
            estado: "rechazado",
            monto: money(payment.transaction_amount),
            transaction_id: transactionId,
            referencia: null,
          },
        });
      }
    }
    await tx.venta.update({
      where: { id_venta: idVenta },
      data: { odoo_sync_error: motivo },
    });
  });

  return "rejected";
}

/**
 * Aplica el resultado de un pago de Mercado Pago sobre la venta local.
 * Soporta pago con una o dos tarjetas: cada notification puede traer un
 * parcial; la venta pasa a pagada recién cuando la suma de pagos aprobados
 * cubre el total. Idempotente por transaction_id.
 */
export async function applyMercadoPagoPayment(
  payment: PaymentResponse,
  options?: { syncOdoo?: boolean },
): Promise<MpSyncResult> {
  const idVenta = Number(payment.external_reference);
  if (!Number.isInteger(idVenta) || idVenta <= 0) return "ignored";

  const venta = await prisma.venta.findUnique({
    where: { id_venta: idVenta },
    include: { detalles: true, envios: true, pagos: true },
  });
  if (!venta) return "ignored";

  if (venta.estado === "pagada") return "approved";

  const amount = money(payment.transaction_amount);
  const total = money(venta.total);
  if (!(amount > 0)) {
    throw new Error(`Monto MP inválido para la venta ${idVenta}`);
  }
  // Un parcial no puede superar el total de la venta (margen de redondeo).
  if (cents(amount) - cents(total) > 1) {
    const motivo = `MP monto inválido: cobrado ${amount} vs venta ${total}`;
    await prisma.venta
      .update({
        where: { id_venta: idVenta },
        data: { odoo_sync_error: motivo },
      })
      .catch(() => undefined);
    throw new Error(`Monto inválido para la venta ${idVenta}`);
  }

  const status = payment.status ?? "pending";
  const transactionId = String(payment.id ?? "").trim();
  if (!transactionId) return "ignored";

  const statusDetail = payment.status_detail?.trim() || null;
  const tipoPago =
    venta.pagos.find((p) => MP_TIPOS.includes(p.tipo_pago as (typeof MP_TIPOS)[number]))
      ?.tipo_pago ?? "mercado_pago";

  if (status === "approved") {
    const paidInstallments = Math.max(1, Number(payment.installments ?? 1) || 1);
    if (!isMercadoCreditoPayment(payment)) {
      const maxAllowed = await maxInstallmentsForVentaPago(
        tipoPago,
        venta.detalles.map((d) => d.id_producto),
      );
      if (paidInstallments > maxAllowed) {
        return rejectOverInstallments({
          payment,
          idVenta,
          tipoPago,
          maxAllowed,
          paidInstallments,
        });
      }
    }

    let shouldSyncOdoo = false;
    let covered = false;

    await prisma.$transaction(async (tx) => {
      const already = await tx.pago.findUnique({
        where: { transaction_id: transactionId },
      });

      if (!already) {
        const fullAmount = almostEqual(amount, total);
        const shell = await tx.pago.findFirst({
          where: {
            id_venta: idVenta,
            tipo_pago: { in: [...MP_TIPOS] },
            transaction_id: null,
            estado: { not: "aprobado" },
          },
          orderBy: { id_pago: "asc" },
        });

        if (shell && fullAmount) {
          // Un solo pago por el total: reutiliza la fila creada en checkout.
          await tx.pago.update({
            where: { id_pago: shell.id_pago },
            data: {
              estado: "aprobado",
              monto: amount,
              transaction_id: transactionId,
            },
          });
        } else {
          // Parcial (p. ej. 2 tarjetas) u otra captura: nueva fila.
          // Conserva la shell con preference id en `referencia`.
          await tx.pago.create({
            data: {
              id_venta: idVenta,
              tipo_pago: tipoPago,
              estado: "aprobado",
              monto: amount,
              transaction_id: transactionId,
              referencia: null,
            },
          });
        }
      } else if (already.estado !== "aprobado") {
        await tx.pago.update({
          where: { id_pago: already.id_pago },
          data: { estado: "aprobado", monto: amount },
        });
      }

      const aprobados = await tx.pago.findMany({
        where: {
          id_venta: idVenta,
          tipo_pago: { in: [...MP_TIPOS] },
          estado: "aprobado",
        },
      });
      const sumApproved = aprobados.reduce((s, p) => s + money(p.monto), 0);

      if (cents(sumApproved) + 1 < cents(total)) {
        // Aún faltan parciales (segunda tarjeta, etc.).
        await tx.venta.update({
          where: { id_venta: idVenta },
          data: {
            odoo_sync_error: `MP parcial: acreditado ${sumApproved.toFixed(2)} / ${total.toFixed(2)}`,
          },
        });
        return;
      }

      // Claim atómico de la venta: un solo worker descuenta stock.
      const claimed = await tx.venta.updateMany({
        where: {
          id_venta: idVenta,
          estado: { not: "pagada" },
        },
        data: {
          estado: "pagada",
          odoo_sync_error: null,
        },
      });
      if (claimed.count === 0) {
        covered = true;
        return;
      }

      const warehouseOdooId = venta.odoo_warehouse_id;
      if (!warehouseOdooId) {
        throw new Error(`Venta ${idVenta} sin almacén Odoo asignado`);
      }

      for (const item of venta.detalles) {
        const cantidad = money(item.cantidad);
        const stocks = await tx.stock.findMany({
          where: {
            id_producto: item.id_producto,
            almacen: { odoo_id: warehouseOdooId },
          },
        });
        if (stocks.length === 0) continue;
        const disponible = stocks.reduce(
          (sum, row) => sum + money(row.cantidad),
          0,
        );
        if (disponible < cantidad) {
          throw new Error(`Stock insuficiente: ${item.nombre_producto}`);
        }
        await deductStock(tx, item.id_producto, cantidad, warehouseOdooId);
      }

      if (venta.envios.length > 0) {
        await tx.envio.updateMany({
          where: { id_venta: idVenta },
          data: { estado: "confirmado" },
        });
      }

      // La fila shell (preference id, sin transaction_id) no se marca aprobada
      // para no inflar la suma si hay varios parciales (2 tarjetas).

      covered = true;
      shouldSyncOdoo = true;
    });

    if (shouldSyncOdoo) {
      sendOrderConfirmationEmail(idVenta).catch((err) => {
        console.error("[order-mail] failed", { idVenta, err });
      });
      if (options?.syncOdoo !== false) {
        syncVentaToOdoo(idVenta).catch((err) => {
          console.error(`Odoo sync failed for venta ${idVenta}:`, err);
        });
      }
    }

    return covered ? "approved" : "pending";
  }

  const rejected = status === "rejected" || status === "cancelled";
  const mpMotivo = statusDetail
    ? `MP ${status}: ${statusDetail}`
    : `MP ${status}`;

  const existing = await prisma.pago.findUnique({
    where: { transaction_id: transactionId },
  });

  if (!existing) {
    const fullAmount = almostEqual(amount, total);
    const shell = await prisma.pago.findFirst({
      where: {
        id_venta: idVenta,
        tipo_pago: { in: [...MP_TIPOS] },
        transaction_id: null,
        estado: { not: "aprobado" },
      },
      orderBy: { id_pago: "asc" },
    });

    if (shell && fullAmount) {
      await prisma.pago.update({
        where: { id_pago: shell.id_pago },
        data: {
          estado: rejected ? "rechazado" : "pendiente",
          transaction_id: transactionId,
          monto: amount,
        },
      });
    } else {
      await prisma.pago.create({
        data: {
          id_venta: idVenta,
          tipo_pago: tipoPago,
          estado: rejected ? "rechazado" : "pendiente",
          monto: amount,
          transaction_id: transactionId,
          referencia: null,
        },
      });
    }
  } else if (existing.estado !== "aprobado") {
    await prisma.pago.update({
      where: { id_pago: existing.id_pago },
      data: {
        estado: rejected ? "rechazado" : "pendiente",
        monto: amount,
      },
    });
  }

  if (rejected) {
    const aprobados = await prisma.pago.findMany({
      where: {
        id_venta: idVenta,
        tipo_pago: { in: [...MP_TIPOS] },
        estado: "aprobado",
      },
    });
    const sumApproved = aprobados.reduce((s, p) => s + money(p.monto), 0);

    // Con 2 tarjetas, el rechazo de un parcial no debe cancelar si ya hay
    // acreditaciones; solo cancelamos cuando el rechazo es del total (1 tarjeta)
    // o no hay ningún aprobado.
    const shouldCancel =
      sumApproved < 0.01 && almostEqual(amount, total);

    await prisma.venta.update({
      where: { id_venta: idVenta },
      data: {
        ...(shouldCancel && venta.estado !== "pagada"
          ? { estado: "cancelada" as const }
          : {}),
        odoo_sync_error: mpMotivo,
      },
    });

    if (shouldCancel && venta.estado !== "pagada") {
      await releaseCuponForVenta(idVenta);
    }

    return "rejected";
  }

  await prisma.venta.update({
    where: { id_venta: idVenta },
    data: { odoo_sync_error: mpMotivo },
  });

  return "pending";
}

/**
 * Reconsulta pagos en Mercado Pago por external_reference (= id_venta) y
 * aplica el sync local (stock, email, Odoo si corresponde).
 * Pensado para recuperar casos donde el webhook falló o llegó como merchant_order.
 */
export async function syncVentaFromMercadoPago(
  idVenta: number,
): Promise<ManualMpSyncResult> {
  if (!isMercadoPagoConfigured()) {
    throw new Error("Mercado Pago no está configurado");
  }
  if (!Number.isInteger(idVenta) || idVenta <= 0) {
    throw new Error("id_venta inválido");
  }

  const venta = await prisma.venta.findUnique({
    where: { id_venta: idVenta },
    select: { id_venta: true, estado: true, total: true },
  });
  if (!venta) {
    throw new Error(`Venta ${idVenta} no encontrada`);
  }

  if (venta.estado === "pagada") {
    return {
      result: "approved",
      paymentsFound: 0,
      applied: [],
      message: "La venta ya está pagada",
      odooTriggered: false,
    };
  }

  if (venta.estado === "cancelada") {
    return {
      result: "ignored",
      paymentsFound: 0,
      applied: [],
      message: "La venta está cancelada; no se sincroniza el pago",
      odooTriggered: false,
    };
  }

  const search = await mercadoPagoPayment().search({
    options: {
      external_reference: String(idVenta),
      sort: "date_created",
      criteria: "desc",
      limit: 50,
    },
  });
  const results = search.results ?? [];
  if (results.length === 0) {
    return {
      result: "ignored",
      paymentsFound: 0,
      applied: [],
      message: "No hay pagos en Mercado Pago para esta venta",
      odooTriggered: false,
    };
  }

  // Priorizar approved para marcar pagada cuanto antes.
  const ordered = [...results].sort((a, b) => {
    const rank = (s?: string) =>
      s === "approved" ? 0 : s === "pending" || s === "in_process" ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });

  const applied: ManualMpSyncResult["applied"] = [];
  let lastResult: MpSyncResult = "ignored";

  for (const row of ordered) {
    const paymentId = String(row.id ?? "").trim();
    if (!paymentId) continue;
    const payment = await mercadoPagoPayment().get({ id: paymentId });
    const result = await applyMercadoPagoPayment(payment);
    applied.push({
      id: paymentId,
      status: payment.status ?? row.status ?? "unknown",
      result,
    });
    lastResult = result;
    if (result === "approved") break;
  }

  const refreshed = await prisma.venta.findUnique({
    where: { id_venta: idVenta },
    select: { estado: true },
  });
  const becamePaid =
    lastResult === "approved" && refreshed?.estado === "pagada";

  const message = becamePaid
    ? "Pago acreditado; venta marcada como pagada (Odoo disparado si correspondía)"
    : lastResult === "pending"
      ? "Hay pagos en MP pero aún no cubren el total / siguen pendientes"
      : lastResult === "rejected"
        ? "Los pagos encontrados están rechazados o cancelados"
        : lastResult === "approved"
          ? "Pago ya aplicado"
          : "No se aplicaron cambios";

  return {
    result: lastResult,
    paymentsFound: results.length,
    applied,
    message,
    odooTriggered: becamePaid,
  };
}

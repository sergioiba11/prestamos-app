export type FacturaData = {
  titulo?: string
  numeroComprobante?: string
  fechaEmision: string
  clienteId?: string
  prestamoId?: string
  metodoPago: string
  montoPagado: number
  montoRecibido: number
  vuelto: number
  saldoRestante: number
  cuotasImpactadas?: string
  proximaCuota?: string
}

function escapeHtml(texto: string) {
  return String(texto || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatearMoneda(valor: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

export function construirFacturaHtml(data: FacturaData) {
  const titulo = escapeHtml(data.titulo || 'Factura de pago')
  const numeroComprobante = escapeHtml(
    data.numeroComprobante || `FAC-${Date.now()}`
  )

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
      .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; max-width: 760px; margin: 0 auto; }
      h1 { margin: 0 0 8px 0; font-size: 24px; }
      .muted { color: #64748b; font-size: 13px; margin: 2px 0; }
      .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; padding: 8px 0; gap: 10px; }
      .total { font-weight: bold; font-size: 18px; }
      .actions { margin-top: 16px; display: flex; gap: 8px; }
      button { border: 0; border-radius: 8px; padding: 10px 12px; cursor: pointer; background: #0f172a; color: white; }
      @media print { .actions { display: none; } body { margin: 0; } .box { border: none; } }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${titulo}</h1>
      <div class="muted">Comprobante: ${numeroComprobante}</div>
      <div class="muted">Fecha: ${escapeHtml(data.fechaEmision)}</div>
      <div class="muted">Cliente: ${escapeHtml(data.clienteId || '—')}</div>
      <div class="muted">Préstamo: ${escapeHtml(data.prestamoId || '—')}</div>

      <div class="row"><span>Método de pago</span><strong>${escapeHtml(data.metodoPago)}</strong></div>
      <div class="row"><span>Monto aplicado</span><strong>${formatearMoneda(data.montoPagado)}</strong></div>
      <div class="row"><span>Monto recibido</span><strong>${formatearMoneda(data.montoRecibido)}</strong></div>
      <div class="row"><span>Vuelto</span><strong>${formatearMoneda(data.vuelto)}</strong></div>
      <div class="row total"><span>Saldo restante</span><strong>${formatearMoneda(data.saldoRestante)}</strong></div>
      <div class="row"><span>Cuotas impactadas</span><strong>${escapeHtml(data.cuotasImpactadas || 'No informado')}</strong></div>
      <div class="row"><span>Próxima cuota</span><strong>${escapeHtml(data.proximaCuota || 'No informada')}</strong></div>

      <div class="actions">
        <button onclick="window.print()">Imprimir / Guardar en PDF</button>
      </div>
    </div>
  </body>
</html>`
}

export function abrirFacturaImprimibleWeb(data: FacturaData) {
  if (typeof window === 'undefined') return false

  const html = construirFacturaHtml(data)
  const popup = window.open('', '_blank', 'noopener,noreferrer')
  if (!popup) return false

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  return true
}

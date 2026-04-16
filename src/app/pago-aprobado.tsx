import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'

type ParamValue = string | string[] | undefined

type ReceiptLineItem = {
  label: string
  value: string
  emphasize?: boolean
}

type CuotaImpactadaDetalle = {
  numero_cuota: number
  estado: string
  monto_aplicado: number
  saldo_antes: number
  saldo_despues: number
}

function getParamString(value: ParamValue, fallback = '') {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed || fallback
}

function getParamNumber(value: ParamValue, fallback = 0) {
  const parsed = Number(getParamString(value, String(fallback)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCurrencyArs(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatDateTimeLocal(value?: string) {
  const source = value?.trim() ? value : undefined
  const parsed = source ? new Date(source) : new Date()
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    })
  }
  return parsed.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function parseCuotasImpactadas(value: string) {
  if (!value) return [] as number[]
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    }
  } catch {
    const number = Number(value)
    if (Number.isFinite(number)) return [number]
  }
  return [] as number[]
}

function parseCuotasImpactadasDetalle(value: string): CuotaImpactadaDetalle[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        numero_cuota: Number(item?.numero_cuota || 0),
        estado: String(item?.estado || ''),
        monto_aplicado: Number(item?.monto_aplicado || 0),
        saldo_antes: Number(item?.saldo_antes || 0),
        saldo_despues: Number(item?.saldo_despues || 0),
      }))
      .filter((item) => Number.isFinite(item.numero_cuota) && item.numero_cuota > 0)
  } catch {
    return []
  }
}

function formatFallback(value: string, fallback = 'No informado') {
  return value.trim() ? value : fallback
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, '')
}

function buildReceiptNumber(paymentId: string, loanId: string, dateTime: string) {
  if (paymentId) return `REC-${paymentId.slice(0, 8).toUpperCase()}`
  const datePart = dateTime.replace(/\D/g, '').slice(0, 12)
  const loanPart = loanId.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || 'PAGO'
  return `REC-${datePart || '000000000000'}-${loanPart}`
}

async function loadScript(src: string, webDocument: any) {
  if (!webDocument) return
  const existing = webDocument.querySelector(`script[src="${src}"]`)
  if (existing?.dataset?.loaded === 'true') return

  await new Promise<void>((resolve, reject) => {
    const script = existing || webDocument.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    if (!existing) webDocument.head.appendChild(script)
  })
}

function formatFileName(cliente: string, fecha: string) {
  const safeCliente =
    cliente
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'cliente'
  const dateOnly = (fecha || new Date().toISOString()).replace(/[^\d]/g, '').slice(0, 8) || 'fecha'
  return `comprobante-${safeCliente}-${dateOnly}.pdf`
}

export default function PagoAprobado() {
  const params = useLocalSearchParams()
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const receiptRef = useRef<View | null>(null)

  const montoPagado = getParamNumber(params.monto)
  const montoEntregado = getParamNumber(params.monto_ingresado)
  const vuelto = getParamNumber(params.vuelto)
  const saldoRestante = getParamNumber(params.saldo_restante)
  const montoCuota = getParamNumber(params.monto_cuota, montoPagado)

  const metodo = getParamString(params.metodo, 'No informado')
  const prestamoId = getParamString(params.prestamo_id)
  const clienteId = getParamString(params.cliente_id)
  const numeroCuota = getParamString(params.numero_cuota)
  const pagoId = getParamString(params.pago_id)
  const pagoInternoId = getParamString(params.identificador_interno_pago)
  const fechaRaw = getParamString(params.fecha)
  const fechaFormateada = formatDateTimeLocal(fechaRaw)

  const cuotasImpactadas = useMemo(
    () => parseCuotasImpactadas(getParamString(params.cuotas_aplicadas)),
    [params.cuotas_aplicadas]
  )
  const cuotasImpactadasDetalle = useMemo(
    () => parseCuotasImpactadasDetalle(getParamString(params.cuotas_impactadas_detalle)),
    [params.cuotas_impactadas_detalle]
  )
  const estadoComprobante = getParamString(params.estado_comprobante, 'COMPLETO').toUpperCase()

  const proximaCuota = getParamString(params.proxima_cuota)
  const clienteNombre = formatFallback(
    `${getParamString(params.cliente_nombre)} ${getParamString(params.cliente_apellido)}`.trim(),
    'Cliente no informado'
  )
  const clienteDni = getParamString(params.cliente_dni)
  const clienteEmail = getParamString(params.cliente_email)
  const clienteTelefono = getParamString(params.cliente_telefono)
  const observaciones = getParamString(params.observaciones)

  const receiptNumber = buildReceiptNumber(pagoId, prestamoId, fechaRaw || fechaFormateada)
  const cuotasTexto = cuotasImpactadasDetalle.length
    ? cuotasImpactadasDetalle
        .map((item) => `#${item.numero_cuota} (${String(item.estado || '').toUpperCase()})`)
        .join(', ')
    : cuotasImpactadas.length > 0
      ? cuotasImpactadas.map((item) => `#${item}`).join(', ')
      : 'Sin detalle de cuotas impactadas'

  const proximaCuotaTexto = proximaCuota
    ? `Cuota #${proximaCuota}`
    : saldoRestante <= 0
      ? 'Préstamo saldado / sin saldo pendiente'
      : 'Sin próxima cuota informada'

  const isEfectivo = metodo.toLowerCase() === 'efectivo'
  const paymentMethodLabel =
    metodo.toLowerCase() === 'mercadopago' ? 'Mercado Pago' : metodo[0]?.toUpperCase() + metodo.slice(1)

  const shareText = [
    'Comprobante de pago - Creditodo',
    `Recibo: ${receiptNumber}`,
    `Cliente: ${clienteNombre}`,
    `Monto pagado: ${formatCurrencyArs(montoPagado)}`,
    `Método: ${paymentMethodLabel}`,
    `Fecha: ${fechaFormateada}`,
    `Cuotas impactadas: ${cuotasTexto}`,
    `Saldo restante: ${formatCurrencyArs(saldoRestante)}`,
  ].join('\n')

  const receiptMetaItems: ReceiptLineItem[] = [
    {
      label: 'Estado',
      value: estadoComprobante === 'PARCIAL' ? 'Pago aprobado (PARCIAL)' : 'Pago aprobado (COMPLETO)',
      emphasize: true,
    },
    { label: 'Recibo N.º', value: receiptNumber },
    { label: 'Fecha y hora', value: fechaFormateada },
    { label: 'ID préstamo', value: formatFallback(prestamoId) },
  ]

  const clientItems: ReceiptLineItem[] = [
    { label: 'Nombre completo', value: clienteNombre },
    { label: 'DNI', value: formatFallback(clienteDni, 'No registrado') },
    { label: 'Email', value: formatFallback(clienteEmail, 'No registrado') },
    { label: 'ID cliente', value: formatFallback(clienteId) },
  ]

  const paymentItems: ReceiptLineItem[] = [
    { label: 'Método de pago', value: formatFallback(paymentMethodLabel) },
    { label: 'Cuota abonada', value: numeroCuota ? `Cuota #${numeroCuota}` : 'No informada' },
    {
      label: 'Cantidad de cuotas impactadas',
      value: cuotasImpactadas.length ? String(cuotasImpactadas.length) : 'No informado',
    },
    { label: 'Cuotas impactadas', value: cuotasTexto },
    { label: 'Próxima cuota pendiente', value: proximaCuotaTexto },
  ]

  const financeItems: ReceiptLineItem[] = [
    { label: 'Monto de cuota', value: formatCurrencyArs(montoCuota) },
    { label: 'Monto pagado', value: formatCurrencyArs(montoPagado), emphasize: true },
    {
      label: isEfectivo ? 'Monto entregado' : 'Monto acreditado',
      value: formatCurrencyArs(isEfectivo ? montoEntregado : montoPagado),
    },
    ...(isEfectivo
      ? [{ label: 'Vuelto', value: formatCurrencyArs(vuelto) }]
      : []),
    {
      label: 'Saldo restante',
      value: saldoRestante <= 0 ? 'Préstamo saldado / sin saldo pendiente' : formatCurrencyArs(saldoRestante),
      emphasize: saldoRestante <= 0,
    },
  ]

  const paymentIdentifier = formatFallback(pagoInternoId || pagoId, 'No disponible')

  const onPrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print()
    }
  }

  const onShare = async () => {
    try {
      await Share.share({ message: shareText })
    } catch {
      const nav = globalThis as typeof globalThis & {
        navigator?: { clipboard?: { writeText: (text: string) => Promise<void> } }
      }
      if (Platform.OS === 'web' && nav.navigator?.clipboard?.writeText) {
        await nav.navigator.clipboard.writeText(shareText)
        return
      }
      const toPhone = normalizePhone(clienteTelefono)
      const waUrl = `https://wa.me/${toPhone}?text=${encodeURIComponent(shareText)}`
      if (toPhone) {
        await Linking.openURL(waUrl)
      }
    }
  }

  const handleDownloadPDF = async () => {
    if (downloadingPdf) return

    const webGlobal = globalThis as any
    const webWindow = webGlobal?.window
    const webDocument = webGlobal?.document
    if (Platform.OS !== 'web' || !webWindow || !webDocument) {
      return
    }

    setDownloadingPdf(true)
    try {
      await loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js', webDocument)
      await loadScript('https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js', webDocument)

      const html2canvas = webWindow?.html2canvas
      const jsPDFCtor = webWindow?.jspdf?.jsPDF
      if (!html2canvas || !jsPDFCtor) {
        throw new Error('No se pudieron inicializar las librerías de PDF')
      }

      const targetElement =
        (receiptRef.current as unknown as any) ||
        webDocument.getElementById('creditodo-recibo-paper')
      if (!targetElement) {
        throw new Error('No se encontró el comprobante para exportar')
      }

      const originalBackground = targetElement.style.backgroundColor
      targetElement.style.backgroundColor = '#FFFFFF'

      const canvas = await html2canvas(targetElement, {
        scale: 2,
        backgroundColor: '#FFFFFF',
        useCORS: true,
        logging: false,
      })

      targetElement.style.backgroundColor = originalBackground

      const imageData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const usableWidth = pageWidth - margin * 2
      const usableHeight = pageHeight - margin * 2
      const imageHeight = (canvas.height * usableWidth) / canvas.width

      let y = margin
      let heightLeft = imageHeight
      pdf.addImage(imageData, 'PNG', margin, y, usableWidth, imageHeight)
      heightLeft -= usableHeight

      while (heightLeft > 0) {
        y = heightLeft - imageHeight + margin
        pdf.addPage()
        pdf.addImage(imageData, 'PNG', margin, y, usableWidth, imageHeight)
        heightLeft -= usableHeight
      }

      pdf.save(formatFileName(clienteNombre, fechaRaw || new Date().toISOString()))
    } catch (error) {
      console.error('Error al generar PDF', error)
      Alert.alert('No se pudo descargar el PDF', 'Intentá nuevamente en unos segundos.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return

    const styleTag = document.createElement('style')
    styleTag.setAttribute('id', 'creditodo-recibo-print-styles')
    styleTag.textContent = `
      @media print {
        body {
          background: #ffffff !important;
        }
        #creditodo-recibo-root {
          background: #ffffff !important;
          padding: 0 !important;
        }
        #creditodo-recibo-actions,
        #creditodo-recibo-back {
          display: none !important;
        }
        #creditodo-recibo-paper {
          max-width: 760px !important;
          border: 1px solid #d1d5db !important;
          border-radius: 12px !important;
          margin: 0 auto !important;
          box-shadow: none !important;
        }
      }
    `
    document.head.appendChild(styleTag)

    return () => {
      styleTag.remove()
    }
  }, [])

  return (
    <View style={styles.screen} nativeID="creditodo-recibo-root">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.paper} nativeID="creditodo-recibo-paper" ref={receiptRef}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/logo-root.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <View style={styles.headerTextWrap}>
              <Text style={styles.brandName}>Creditodo</Text>
              <Text style={styles.title}>Recibo de pago</Text>
              <Text style={styles.subtitle}>Comprobante financiero</Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            {receiptMetaItems.map((item) => (
              <View key={item.label} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{item.label}</Text>
                <Text style={[styles.metaValue, item.emphasize && styles.approvedValue]}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del cliente</Text>
            {clientItems.map((item) => (
              <View key={item.label} style={styles.row}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del pago</Text>
            {paymentItems.map((item) => (
              <View key={item.label} style={styles.row}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detalle financiero</Text>
            {financeItems.map((item) => (
              <View key={item.label} style={styles.row}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={[styles.rowValue, item.emphasize && styles.highlightValue]}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observaciones</Text>
            <Text style={styles.notes}>{formatFallback(observaciones, 'Sin observaciones registradas')}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLabel}>Identificador interno del pago</Text>
            <Text style={styles.footerValue}>{paymentIdentifier}</Text>
          </View>
        </View>

        <View style={styles.actions} nativeID="creditodo-recibo-actions">
          <Pressable style={styles.actionPrimary} onPress={onPrint}>
            <Text style={styles.actionPrimaryText}>Imprimir</Text>
          </Pressable>
          <Pressable style={styles.actionSecondary} onPress={() => void onShare()}>
            <Text style={styles.actionSecondaryText}>Compartir comprobante</Text>
          </Pressable>
          <Pressable
            style={[styles.actionPdf, downloadingPdf && styles.actionPdfDisabled]}
            disabled={downloadingPdf}
            onPress={() => void handleDownloadPDF()}
          >
            <Text style={styles.actionPdfText}>
              {downloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionGhost}
            onPress={() => router.replace(`/cliente-detalle?cliente_id=${clienteId}` as any)}
            nativeID="creditodo-recibo-back"
          >
            <Text style={styles.actionGhostText}>Volver al préstamo / cliente</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EEF2FF',
  },
  scrollContent: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 14,
    alignItems: 'center',
  },
  paper: {
    width: '100%',
    maxWidth: 820,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  logo: {
    width: 60,
    height: 60,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  metaGrid: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  metaItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 2,
  },
  metaLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: '#64748B',
    fontWeight: '700',
  },
  metaValue: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
  },
  approvedValue: {
    color: '#166534',
  },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionTitle: {
    backgroundColor: '#F8FAFC',
    color: '#1E293B',
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    gap: 4,
  },
  rowLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  rowValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  highlightValue: {
    color: '#14532D',
  },
  notes: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 12,
    gap: 4,
  },
  footerLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  footerValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    width: '100%',
    maxWidth: 820,
    gap: 10,
    marginBottom: 8,
  },
  actionPrimary: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  actionSecondary: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionSecondaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  actionPdf: {
    borderWidth: 1,
    borderColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
  actionPdfDisabled: {
    opacity: 0.6,
  },
  actionPdfText: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 14,
  },
  actionGhost: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#94A3B8',
  },
  actionGhostText: {
    color: '#1E293B',
    fontWeight: '700',
    fontSize: 14,
  },
})

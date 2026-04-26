import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { safeGoBack } from '../lib/navigation'
import { supabase } from '../lib/supabase'

type CuotaImpactadaDetalle = {
  numero_cuota: number
  estado: string
  monto_aplicado: number
  saldo_antes: number
  saldo_despues: number
  dias_mora?: number
  porcentaje_mora?: number
  monto_mora?: number
  total_con_mora?: number
}

type PagoComprobanteRow = {
  id: string
  prestamo_id: string | null
  cliente_id: string | null
  monto: number | null
  metodo: string | null
  estado: string | null
  impactado: boolean | null
  created_at: string | null
  fecha_pago: string | null
}

type ClienteComprobanteRow = {
  id: string
  nombre: string | null
  apellido: string | null
  nombre_completo?: string | null
  razon_social?: string | null
  full_name?: string | null
  name?: string | null
  dni: string | null
  documento?: string | null
  numero_documento?: string | null
  cedula?: string | null
  email: string | null
  telefono: string | null
  usuario_id: string | null
}

type PrestamoComprobanteRow = {
  id: string
  cliente_id: string | null
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  estado: string | null
  cuotas: number | null
}

type UsuarioComprobanteRow = {
  id?: string | null
  usuario_id?: string | null
  email?: string | null
  correo?: string | null
}

type CuotaDbRow = {
  id: string
  numero_cuota: number | null
  saldo_pendiente: number | null
  estado: string | null
  fecha_vencimiento?: string | null
}

type PagoDetalleRow = {
  cuota_id: string | null
  numero_cuota: number | null
  monto_aplicado: number | null
  saldo_cuota_antes: number | null
  saldo_cuota_despues: number | null
  dias_mora: number | null
  porcentaje_mora: number | null
  monto_mora: number | null
  total_con_mora: number | null
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

function formatFallback(value: string, fallback = 'No informado') {
  return value.trim() ? value : fallback
}

function parseNumberParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDetalleParam(value: string | string[] | undefined): CuotaImpactadaDetalle[] {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        numero_cuota: Number(item?.numero_cuota || 0),
        estado: String(item?.estado_resultante || item?.estado || ''),
        monto_aplicado: Number(item?.monto_aplicado || 0),
        saldo_antes: Number(item?.saldo_cuota_antes ?? item?.saldo_antes ?? 0),
        saldo_despues: Number(item?.saldo_cuota_despues ?? item?.saldo_despues ?? 0),
      }))
      .filter((item) => Number.isFinite(item.numero_cuota) && item.numero_cuota > 0)
  } catch {
    return []
  }
}


function estadoCuotaLabel(item: CuotaImpactadaDetalle) {
  const estado = String(item.estado || '').toLowerCase()
  const estaPagada = estado === 'pagada' || estado === 'paga' || Number(item.saldo_despues || 0) <= 0.009
  return estaPagada ? 'pagada completamente' : 'con pago parcial'
}

function describirCuotasImpactadas(cuotas: CuotaImpactadaDetalle[]) {
  if (!cuotas.length) return 'Sin detalle de cuotas impactadas'
  if (cuotas.length === 1) {
    const cuota = cuotas[0]
    const estado = estadoCuotaLabel(cuota).includes('parcial') ? 'parcial' : 'pagada'
    return `Cuota #${cuota.numero_cuota} ${estado}`
  }
  return cuotas
    .map((item) => `Cuota #${item.numero_cuota} ${estadoCuotaLabel(item)}`)
    .join(', ')
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

function shortId(value: string, size = 8) {
  const raw = String(value || '').trim()
  if (!raw) return 'No disponible'
  if (raw.length <= size + 3) return raw
  return `${raw.slice(0, size)}...`
}

export default function PagoAprobado() {
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams()
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [validatingPayment, setValidatingPayment] = useState(true)
  const [paymentApproved, setPaymentApproved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [pago, setPago] = useState<PagoComprobanteRow | null>(null)
  const [cliente, setCliente] = useState<ClienteComprobanteRow | null>(null)
  const [usuario, setUsuario] = useState<UsuarioComprobanteRow | null>(null)
  const [prestamo, setPrestamo] = useState<PrestamoComprobanteRow | null>(null)
  const [saldoRestantePrestamoDb, setSaldoRestantePrestamoDb] = useState<number | null>(null)
  const [proximaCuotaDb, setProximaCuotaDb] = useState<string>('')
  const [cuotasImpactadasDb, setCuotasImpactadasDb] = useState<number[]>([])
  const [cuotasImpactadasDetalleDb, setCuotasImpactadasDetalleDb] = useState<CuotaImpactadaDetalle[]>([])
  const receiptRef = useRef<View | null>(null)

  const montoAplicado = Number.isFinite(Number(pago?.monto)) ? Number(pago?.monto || 0) : 0
  const montoIngresadoParam = parseNumberParam(params.monto_ingresado)
  const vueltoParam = parseNumberParam(params.vuelto)
  const saldoRestanteParam = parseNumberParam(params.saldo_restante)
  const cuotasDetalleParam = useMemo(
    () => parseDetalleParam(params.cuotas_impactadas_detalle),
    [params.cuotas_impactadas_detalle]
  )
  const montoIngresado = Number.isFinite(Number(montoIngresadoParam))
    ? Number(montoIngresadoParam)
    : montoAplicado
  const saldoRestante = Number.isFinite(Number(saldoRestantePrestamoDb))
    ? Number(saldoRestantePrestamoDb || 0)
    : Number.isFinite(Number(saldoRestanteParam))
      ? Number(saldoRestanteParam)
      : 0

  const metodo = String(pago?.metodo || '')
  const prestamoId = String(prestamo?.id || pago?.prestamo_id || '')
  const clienteId = String(cliente?.id || pago?.cliente_id || '')
  const pagoIdParam = Array.isArray(params.pago_id) ? params.pago_id[0] : params.pago_id
  const pagoIdAliasParam = Array.isArray(params.id) ? params.id[0] : params.id
  const pagoId = typeof pagoIdParam === 'string' && pagoIdParam.trim()
    ? pagoIdParam.trim()
    : typeof pagoIdAliasParam === 'string'
      ? pagoIdAliasParam.trim()
      : ''
  const pagoInternoId = String(pago?.id || '')
  const fechaRaw = String(pago?.fecha_pago || pago?.created_at || '')
  const fechaFormateada = formatDateTimeLocal(fechaRaw)
  const proximaCuota = proximaCuotaDb
  const nombreFinal = useMemo(() => {
    const nombreCompleto = String(cliente?.nombre_completo || '').trim()
    const nombre = String(cliente?.nombre || '').trim()
    const apellido = String(cliente?.apellido || '').trim()
    const razonSocial = String(cliente?.razon_social || '').trim()
    const fullName = String(cliente?.full_name || '').trim()
    const name = String(cliente?.name || '').trim()
    return (
      nombreCompleto ||
      [nombre, apellido].filter(Boolean).join(' ').trim() ||
      razonSocial ||
      fullName ||
      name ||
      'Cliente no informado'
    )
  }, [
    cliente?.apellido,
    cliente?.full_name,
    cliente?.name,
    cliente?.nombre,
    cliente?.nombre_completo,
    cliente?.razon_social,
  ])
  const clienteNombre = nombreFinal
  const dniFinal =
    String(
      cliente?.dni ||
      cliente?.documento ||
      cliente?.numero_documento ||
      cliente?.cedula ||
      'No registrado'
    )
  const metodoNormalizado = metodo.toLowerCase().trim()
  const isEfectivo = metodoNormalizado === 'efectivo'
  const isPagoDigital = metodoNormalizado === 'transferencia' || metodoNormalizado === 'mercadopago' || metodoNormalizado === 'mercado_pago'
  const paymentMethodLabel =
    metodoNormalizado === 'mercadopago' || metodoNormalizado === 'mercado_pago'
      ? 'Mercado Pago'
      : metodo
        ? metodo[0]?.toUpperCase() + metodo.slice(1)
        : 'No informado'
  const labelEntregado = isPagoDigital ? 'Monto transferido' : 'Monto entregado'
  const montoEntregadoVisual = isPagoDigital ? montoAplicado : montoIngresado

  const computedVuelto = isEfectivo ? Math.max(0, Number((montoIngresado - montoAplicado).toFixed(2))) : 0
  const vueltoReal = isEfectivo
    ? Number.isFinite(Number(vueltoParam))
      ? Number(vueltoParam)
      : computedVuelto
    : 0
  const vueltoVisual = isPagoDigital ? 0 : vueltoReal

  const cuotasDetalleNormalizadas = useMemo(() => {
    if (cuotasImpactadasDetalleDb.length > 0) return cuotasImpactadasDetalleDb
    if (cuotasDetalleParam.length > 0) return cuotasDetalleParam
    const cuotasBase = cuotasImpactadasDb.length > 0 ? cuotasImpactadasDb : []
    if (cuotasBase.length > 0) {
      return cuotasBase.map((numero) => ({
        numero_cuota: numero,
        estado: '',
        monto_aplicado: 0,
        saldo_antes: 0,
        saldo_despues: 0,
      }))
    }
    return [] as CuotaImpactadaDetalle[]
  }, [
    cuotasImpactadasDetalleDb,
    cuotasImpactadasDb,
    cuotasDetalleParam,
  ])
  const moraResumen = useMemo(() => {
    const detalle = cuotasImpactadasDetalleDb as any[]
    if (!detalle.length) return { dias: 0, porcentaje: 0, monto: 0, total: 0 }
    const dias = Math.max(0, ...detalle.map((d) => Number(d?.dias_mora || 0)))
    const porcentaje = detalle.reduce((acc, d) => acc + Number(d?.porcentaje_mora || 0), 0)
    const monto = detalle.reduce((acc, d) => acc + Number(d?.monto_mora || 0), 0)
    const total = detalle.reduce((acc, d) => acc + Number(d?.total_con_mora || 0), 0)
    return { dias, porcentaje, monto, total }
  }, [cuotasImpactadasDetalleDb])

  const cantidadCuotasImpactadas = cuotasDetalleNormalizadas.length
  const cuotaPrincipal = cuotasDetalleNormalizadas[0] || null
  const saldoRestanteCuota = Number(cuotaPrincipal?.saldo_despues || 0)
  const esPagoParcial = cuotasDetalleNormalizadas.some((item) => Number(item.saldo_despues || 0) > 0)
  const esPagoFinal = Number.isFinite(Number(saldoRestante)) && Number(saldoRestante) <= 0.009

  const receiptNumber = buildReceiptNumber(pagoId, prestamoId, fechaRaw || fechaFormateada)
  const cuotasTexto = describirCuotasImpactadas(cuotasDetalleNormalizadas)
  const isMobile = width < 768
  const isTablet = width >= 768 && width < 1024
  const isDesktop = width >= 1024

  const proximaCuotaTexto = esPagoFinal
    ? 'Préstamo saldado / sin saldo pendiente'
    : proximaCuota
      ? `Cuota #${proximaCuota}`
      : 'Cuota no informada'

  useEffect(() => {
    const loadReceiptData = async () => {
      console.log('PARAMS pago-aprobado:', params)
      console.log('PAGO ID usado:', pagoId)
      try {
        setLoadError('')
        if (!pagoId) {
          setPago(null)
          setPaymentApproved(false)
          setLoadError('No se recibió pago_id')
          return
        }

        const { data: pago, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('id', pagoId)
          .maybeSingle()
        console.log('pago comprobante:', pago)
        console.log('error pago comprobante:', pagoError)
        if (pagoError) {
          setPago(null)
          setPaymentApproved(false)
          setLoadError(pagoError.message || 'Error al cargar el pago.')
          return
        }
        if (!pago) {
          setPago(null)
          setPaymentApproved(false)
          setLoadError(`No se encontró el pago con ID: ${pagoId}`)
          return
        }
        const pagoNormalizado = pago as PagoComprobanteRow
        setPago(pagoNormalizado)
        console.log('cliente_id comprobante:', pago?.cliente_id)

        const estado = String(pagoNormalizado.estado || '').toLowerCase()
        const impactado = Boolean(pagoNormalizado.impactado)
        setPaymentApproved(estado === 'aprobado' && impactado)

        let cliente: ClienteComprobanteRow | null = null
        let usuario: UsuarioComprobanteRow | null = null
        if (pagoNormalizado.cliente_id) {
          console.log('cliente_id usado:', pagoNormalizado.cliente_id)
          const { data: clienteQueryData, error: clienteError } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', pagoNormalizado.cliente_id)
            .maybeSingle()
          console.log('cliente completo comprobante:', clienteQueryData)
          console.log('cliente error comprobante:', clienteError)
          if (clienteError) {
            console.error('Error cargando cliente para comprobante:', clienteError)
          } else {
            cliente = (clienteQueryData || null) as ClienteComprobanteRow | null
          }

          if (cliente?.usuario_id && !String(cliente.email || '').trim()) {
            const { data: usuarioByIdData, error: usuarioByIdError } = await supabase
              .from('usuarios')
              .select('*')
              .eq('id', cliente.usuario_id)
              .maybeSingle()
            if (usuarioByIdError) {
              console.error('Error cargando usuario por id para comprobante:', usuarioByIdError)
            } else {
              usuario = (usuarioByIdData || null) as UsuarioComprobanteRow | null
            }

            if (usuario?.email) {
              cliente = {
                ...cliente,
                email: String(usuario.email || cliente.email || ''),
              }
            }
          }
        }
        if (cliente) setCliente(cliente)
        if (usuario) setUsuario(usuario)
        console.log('cliente comprobante:', cliente)
        console.log('usuario comprobante:', usuario)

        let prestamo: PrestamoComprobanteRow | null = null
        if (pagoNormalizado.prestamo_id) {
          const { data: prestamoQueryData, error: prestamoError } = await supabase
            .from('prestamos')
            .select('id,cliente_id,monto,interes,total_a_pagar,estado,cuotas')
            .eq('id', pagoNormalizado.prestamo_id)
            .maybeSingle()
          if (prestamoError) {
            console.error('Error cargando préstamo para comprobante:', prestamoError)
          } else {
            prestamo = (prestamoQueryData || null) as PrestamoComprobanteRow | null
          }

          const { data: cuotasData, error: cuotasError } = await supabase
            .from('cuotas')
            .select('id,numero_cuota,saldo_pendiente,estado,fecha_vencimiento')
            .eq('prestamo_id', pagoNormalizado.prestamo_id)
            .in('estado', ['pendiente', 'parcial'])
          if (cuotasError) {
            console.error('Error calculando saldo restante para comprobante:', cuotasError)
            setSaldoRestantePrestamoDb(null)
            setProximaCuotaDb('')
          } else {
            const cuotasPendientes = (cuotasData || []) as CuotaDbRow[]
            const saldoCalculado = cuotasPendientes
              .reduce((acc, item) => acc + Number(item?.saldo_pendiente || 0), 0)
            setSaldoRestantePrestamoDb(Number.isFinite(saldoCalculado) ? saldoCalculado : null)
            const proxima = cuotasPendientes
              .sort((a, b) => Number(a.numero_cuota || 0) - Number(b.numero_cuota || 0))[0]
            setProximaCuotaDb(proxima?.numero_cuota ? String(proxima.numero_cuota) : '')
          }

          const { data: detalleData, error: detalleError } = await supabase
            .from('pagos_detalle')
            .select('cuota_id,numero_cuota,monto_aplicado,saldo_cuota_antes,saldo_cuota_despues,dias_mora,porcentaje_mora,monto_mora,total_con_mora')
            .eq('pago_id', pagoNormalizado.id)

          if (detalleError) {
            console.error('Error cargando cuotas impactadas para comprobante:', detalleError)
            setCuotasImpactadasDb([])
            setCuotasImpactadasDetalleDb([])
          } else {
            const detalleList = (detalleData || []) as PagoDetalleRow[]
            const cuotaIds = detalleList.map((item) => item.cuota_id).filter(Boolean) as string[]
            let estadoByCuota = new Map<string, string>()

            if (cuotaIds.length > 0) {
              const { data: cuotasEstadoData, error: cuotasEstadoError } = await supabase
                .from('cuotas')
                .select('id,estado')
                .in('id', cuotaIds)
              if (cuotasEstadoError) {
                console.error('Error cargando estado de cuotas impactadas para comprobante:', cuotasEstadoError)
              } else {
                estadoByCuota = new Map(
                  ((cuotasEstadoData || []) as Array<{ id: string; estado: string | null }>).map((item) => [
                    item.id,
                    String(item.estado || ''),
                  ])
                )
              }
            }

            const detalleNormalizado = detalleList
              .map((item) => ({
                numero_cuota: Number(item.numero_cuota || 0),
                estado: item.cuota_id ? String(estadoByCuota.get(item.cuota_id) || '') : '',
                monto_aplicado: Number(item.monto_aplicado || 0),
                saldo_antes: Number(item.saldo_cuota_antes || 0),
                saldo_despues: Number(item.saldo_cuota_despues || 0),
                dias_mora: Number(item.dias_mora || 0),
                porcentaje_mora: Number(item.porcentaje_mora || 0),
                monto_mora: Number(item.monto_mora || 0),
                total_con_mora: Number(item.total_con_mora || 0),
              }))
              .filter((item) => Number.isFinite(item.numero_cuota) && item.numero_cuota > 0)
              .sort((a, b) => a.numero_cuota - b.numero_cuota)

            setCuotasImpactadasDetalleDb(detalleNormalizado)
            setCuotasImpactadasDb(detalleNormalizado.map((item) => item.numero_cuota))
          }
        } else {
          setSaldoRestantePrestamoDb(null)
          setProximaCuotaDb('')
          setCuotasImpactadasDb([])
          setCuotasImpactadasDetalleDb([])
        }
        if (prestamo) setPrestamo(prestamo)
        console.log('prestamo comprobante:', prestamo)
      } catch (error) {
        setPago(null)
        setPaymentApproved(false)
        setLoadError(error instanceof Error ? error.message : 'Error inesperado al cargar el comprobante.')
      } finally {
        setValidatingPayment(false)
      }
    }

    void loadReceiptData()
  }, [pagoId])

  const backToPrestamoUrl = prestamoId
    ? `/cliente/${clienteId}?prestamo_id=${prestamoId}`
    : `/cliente/${clienteId}`

  const paymentIdentifier = formatFallback(pagoInternoId || pagoId, 'No disponible')
  const shortPrestamoId = shortId(prestamoId)
  const shortPagoId = shortId(paymentIdentifier)
  const estadoPago = esPagoFinal
    ? { label: 'Préstamo cancelado', style: styles.statusBadgeSuccessStrong, icon: 'checkmark-done-circle' as const }
    : esPagoParcial
      ? { label: 'Pago parcial', style: styles.statusBadgeWarning, icon: 'warning' as const }
      : { label: 'Cuota pagada', style: styles.statusBadgeSuccess, icon: 'checkmark-circle' as const }

  const onPrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print()
    }
  }

  const generateReceiptPdf = async () => {
    const webGlobal = globalThis as any
    const webWindow = webGlobal?.window
    const webDocument = webGlobal?.document
    if (Platform.OS !== 'web' || !webWindow || !webDocument) {
      throw new Error('La generación de PDF está disponible solo en web')
    }

    await loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js', webDocument)
    await loadScript('https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js', webDocument)

    const html2canvas = webWindow?.html2canvas
    const jsPDFCtor = webWindow?.jspdf?.jsPDF
    if (!html2canvas || !jsPDFCtor) {
      throw new Error('No se pudieron inicializar las librerías de PDF')
    }

    const targetElement =
      (receiptRef.current as unknown as any) ||
      webDocument.getElementById('receipt-print-area')
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

    const pdfBlob = pdf.output('blob')
    return {
      blob: pdfBlob as Blob,
      fileName: formatFileName(clienteNombre, fechaRaw || new Date().toISOString()),
    }
  }

  const downloadReceiptPdf = async () => {
    const { blob, fileName } = await generateReceiptPdf()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  }

  const handleDownloadPDF = async () => {
    if (downloadingPdf) return
    setDownloadingPdf(true)
    try {
      await downloadReceiptPdf()
    } catch (error) {
      console.error('Error al generar PDF', error)
      Alert.alert('No se pudo descargar el PDF', 'Intentá nuevamente en unos segundos.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const onSharePdf = async () => {
    if (downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const { blob, fileName } = await generateReceiptPdf()
      const nav = globalThis.navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean
      }
      const shareFile = new File([blob], fileName, { type: 'application/pdf' })
      const canShareFiles =
        typeof nav?.share === 'function' &&
        typeof nav?.canShare === 'function' &&
        nav.canShare({ files: [shareFile] })

      if (canShareFiles) {
        await nav.share({
          files: [shareFile],
          title: `Comprobante ${receiptNumber}`,
          text: `Comprobante de pago ${receiptNumber}`,
        })
        return
      }

      await downloadReceiptPdf()
      Alert.alert(
        'Compartir no disponible',
        'Tu navegador no permite compartir archivos directamente. Se descargó el comprobante PDF para que puedas adjuntarlo o enviarlo.'
      )
    } catch (error) {
      console.error('Error al compartir PDF', error)
      Alert.alert('No se pudo compartir el PDF', 'Intentá nuevamente en unos segundos.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return

    const styleTag = document.createElement('style')
    styleTag.setAttribute('id', 'creditodo-recibo-print-styles')
    styleTag.textContent = `
      .no-print {}
      @media print {
        @page {
          size: A4;
          margin: 12mm;
        }
        body {
          background: #ffffff !important;
          margin: 0 !important;
        }
        body * {
          visibility: hidden !important;
        }
        #receipt-print-area,
        #receipt-print-area * {
          visibility: visible !important;
        }
        #receipt-print-area {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          border-radius: 0 !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }
        #receipt-print-surface {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }
        .no-print {
          display: none !important;
        }
        ::-webkit-scrollbar {
          display: none !important;
        }
      }
    `
    document.head.appendChild(styleTag)

    return () => {
      styleTag.remove()
    }
  }, [])

  if (validatingPayment) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#22C55E" />
        <Text style={styles.loadingText}>Validando comprobante...</Text>
      </View>
    )
  }

  if (!paymentApproved) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.deniedTitle}>Comprobante no disponible</Text>
        <Text style={styles.deniedText}>{loadError || 'Esta pantalla solo muestra pagos aprobados e impactados.'}</Text>
        <Pressable style={styles.backButton} onPress={() => safeGoBack('admin')}>
          <Text style={styles.backButtonText}>Ir a pagos pendientes</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen} nativeID="creditodo-recibo-root">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.toolbar, styles.noPrint, isDesktop && styles.toolbarDesktop]} nativeID="receipt-screen-actions-top">
          <Pressable
            style={styles.actionGhost}
            onPress={() => safeGoBack('admin')}
          >
            <Text style={styles.actionGhostText}>Volver</Text>
          </Pressable>
        </View>

        <View style={[styles.paper, isDesktop && styles.paperDesktop, isTablet && styles.paperTablet]} nativeID="receipt-print-area" ref={receiptRef}>
          <View style={styles.printPaper} nativeID="receipt-print-surface">
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Image
                  source={require('../../assets/images/logo-root.png')}
                  style={styles.logo}
                  contentFit="contain"
                />
                <View style={styles.headerTextWrap}>
                  <Text style={styles.title}>Recibo de pago</Text>
                  <Text style={styles.subtitle}>Creditodo · Comprobante financiero</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, estadoPago.style]}>
                <Ionicons name={estadoPago.icon} size={16} color="#fff" />
                <Text style={styles.statusBadgeText}>{estadoPago.label}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen</Text>
              <View
                style={[
                  styles.summaryGrid,
                  isMobile ? styles.summaryGridMobile : isTablet ? styles.summaryGridTablet : styles.summaryGridDesktop,
                ]}
              >
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Pagado</Text>
                  <Text style={styles.summaryValue}>{formatCurrencyArs(montoAplicado)}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>{labelEntregado}</Text>
                  <Text style={styles.summaryValue}>{formatCurrencyArs(montoEntregadoVisual)}</Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryCardVuelto]}>
                  <Text style={styles.summaryLabelVuelto}>Vuelto 💵</Text>
                  <Text style={styles.summaryValueVuelto}>{formatCurrencyArs(vueltoVisual)}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.section, styles.financialSection]}>
              <Text style={styles.sectionTitle}>Detalle financiero</Text>
              <View style={styles.row}><Text style={styles.rowLabel}>Método de pago</Text><Text style={styles.rowValue}>{formatFallback(paymentMethodLabel)}</Text></View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Cuota impactada</Text>
                <Text style={styles.rowValue}>
                  {cantidadCuotasImpactadas ? cuotasTexto : 'No informado'}
                </Text>
              </View>
              <View style={styles.row}><Text style={styles.rowLabel}>Monto de cuota</Text><Text style={styles.rowValue}>{formatCurrencyArs(montoAplicado + saldoRestanteCuota)}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>Monto aplicado</Text><Text style={[styles.rowValue, styles.highlightValue]}>{formatCurrencyArs(montoAplicado)}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>Deuda restante del préstamo</Text><Text style={styles.rowValue}>{saldoRestante <= 0 ? 'Préstamo saldado' : formatCurrencyArs(saldoRestante)}</Text></View>
            </View>

            {(moraResumen.dias > 0 || moraResumen.porcentaje > 0 || moraResumen.monto > 0) ? (
              <View style={[styles.section, styles.moraSection]}>
                <Text style={styles.sectionTitle}>Mora</Text>
                <View style={styles.row}><Text style={styles.rowLabel}>Días de atraso</Text><Text style={styles.rowValue}>{moraResumen.dias}</Text></View>
                <View style={styles.row}><Text style={styles.rowLabel}>Porcentaje de mora</Text><Text style={styles.rowValue}>{moraResumen.porcentaje.toFixed(2)}%</Text></View>
                <View style={styles.row}><Text style={styles.rowLabel}>Monto de mora</Text><Text style={styles.rowValue}>{formatCurrencyArs(moraResumen.monto)}</Text></View>
                <View style={styles.row}><Text style={styles.rowLabel}>Total con mora</Text><Text style={styles.rowValue}>{formatCurrencyArs(moraResumen.total)}</Text></View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Info adicional</Text>
              <View style={styles.row}><Text style={styles.rowLabel}>Recibo N°</Text><Text style={styles.rowValue}>{receiptNumber}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>Fecha</Text><Text style={styles.rowValue}>{fechaFormateada}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>Cliente</Text><Text style={styles.rowValue}>{clienteNombre}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>DNI</Text><Text style={styles.rowValue}>{formatFallback(dniFinal, 'No registrado')}</Text></View>
              <View style={styles.row}><Text style={styles.rowLabel}>ID préstamo</Text><Text style={styles.rowValue}>{shortPrestamoId}</Text></View>
              {esPagoFinal ? (
                <View style={styles.loanPaidOffCard}>
                  <Text style={styles.loanPaidOffTitle}>Préstamo completamente saldado</Text>
                </View>
              ) : (
                <View style={styles.nextInstallmentCard}>
                  <Text style={styles.nextInstallmentTitle}>Próxima cuota pendiente</Text>
                  <Text style={styles.nextInstallmentValue}>{proximaCuotaTexto}</Text>
                </View>
              )}
              {esPagoParcial && (
                <View style={styles.partialInfoCard}>
                  <Ionicons name="information-circle" size={18} color="#B45309" />
                  <Text style={styles.partialInfoText}>
                    El pago se distribuyó automáticamente y quedaron saldos pendientes en algunas cuotas.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerLabel}>ID pago corto: {shortPagoId}</Text>
              <Text style={styles.footerMeta}>ID préstamo completo: {formatFallback(prestamoId, 'No disponible')}</Text>
              <Text style={styles.footerMeta}>ID pago completo: {paymentIdentifier}</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.actions,
            styles.noPrint,
            !isMobile && styles.actionsDesktop,
          ]}
          nativeID="creditodo-recibo-actions"
        >
          <Pressable
            style={[
              styles.actionPrimary,
              downloadingPdf && styles.actionPdfDisabled,
              !isMobile && styles.actionDesktopMain,
            ]}
            disabled={downloadingPdf}
            onPress={() => void handleDownloadPDF()}
          >
            <Text style={styles.actionPrimaryText}>
              {downloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionSecondary, !isMobile && styles.actionDesktopMain]}
            disabled={downloadingPdf}
            onPress={() => void onSharePdf()}
          >
            <Text style={styles.actionSecondaryText}>
              {downloadingPdf ? 'Generando PDF...' : 'Compartir PDF'}
            </Text>
          </Pressable>
          <Pressable style={[styles.actionPrint, !isMobile && styles.actionDesktopSecondary]} onPress={onPrint}>
            <Text style={styles.actionPrintText}>Imprimir</Text>
          </Pressable>
          <Pressable style={[styles.actionGhost, !isMobile && styles.actionDesktopSecondary]} onPress={() => safeGoBack('admin')}>
            <Text style={styles.actionGhostText}>Volver</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  noPrint: {},
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    gap: 14,
    alignItems: 'center',
  },
  toolbar: {
    width: '100%',
    maxWidth: 720,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  toolbarDesktop: {
    maxWidth: 1120,
  },
  paper: {
    width: '100%',
    maxWidth: 720,
  },
  paperTablet: {
    maxWidth: 900,
  },
  paperDesktop: {
    maxWidth: 1120,
  },
  printPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logo: {
    width: 42,
    height: 42,
  },
  headerTextWrap: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeSuccess: {
    backgroundColor: '#15803D',
  },
  statusBadgeSuccessStrong: {
    backgroundColor: '#166534',
  },
  statusBadgeWarning: {
    backgroundColor: '#CA8A04',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  financialSection: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
  },
  moraSection: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  summaryGrid: {
    padding: 12,
    gap: 10,
  },
  summaryGridMobile: {
    flexDirection: 'column',
  },
  summaryGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryGridDesktop: {
    flexDirection: 'row',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flex: 1,
    minWidth: 180,
    gap: 4,
  },
  summaryCardVuelto: {
    backgroundColor: '#ECFDF3',
    borderColor: '#22C55E',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 20,
    color: '#0F172A',
    fontWeight: '800',
  },
  summaryLabelVuelto: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryValueVuelto: {
    fontSize: 24,
    color: '#15803D',
    fontWeight: '900',
  },
  sectionTitle: {
    backgroundColor: '#F8FAFC',
    color: '#1E3A8A',
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#1D4ED8',
  },
  partialInfoCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    margin: 12,
  },
  partialInfoText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  loanPaidOffCard: {
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#16A34A',
    borderRadius: 12,
    padding: 10,
    margin: 12,
  },
  loanPaidOffTitle: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '800',
  },
  nextInstallmentCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    padding: 10,
    gap: 2,
    margin: 12,
  },
  nextInstallmentTitle: {
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '700',
  },
  nextInstallmentValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 10,
    gap: 4,
  },
  footerLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  footerMeta: {
    color: '#64748B',
    fontSize: 11,
  },
  actions: {
    width: '100%',
    maxWidth: 720,
    gap: 10,
    marginBottom: 8,
  },
  actionsDesktop: {
    maxWidth: 1120,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionDesktopMain: {
    flex: 1,
    minWidth: 230,
  },
  actionDesktopSecondary: {
    minWidth: 150,
  },
  actionPrimary: {
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  actionSecondary: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionSecondaryText: {
    color: '#ECFDF5',
    fontWeight: '800',
    fontSize: 14,
  },
  actionPdfDisabled: {
    opacity: 0.6,
  },
  actionGhost: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  actionGhostText: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 14,
  },
  actionPrint: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#94A3B8',
    backgroundColor: '#F8FAFC',
  },
  actionPrintText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020817',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#CBD5E1',
    fontWeight: '600',
  },
  deniedTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  deniedText: {
    color: '#94A3B8',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 8,
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
})

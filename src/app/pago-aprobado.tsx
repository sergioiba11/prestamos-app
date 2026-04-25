import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { supabase } from '../lib/supabase'

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
  const cuotasDetalleParam = useMemo(
    () => parseDetalleParam(params.cuotas_impactadas_detalle),
    [params.cuotas_impactadas_detalle]
  )
  const montoIngresado = Number.isFinite(Number(montoIngresadoParam))
    ? Number(montoIngresadoParam)
    : montoAplicado
  const saldoRestante = Number.isFinite(Number(saldoRestantePrestamoDb))
    ? Number(saldoRestantePrestamoDb || 0)
    : 0

  const metodo = String(pago?.metodo || '')
  const prestamoId = String(prestamo?.id || pago?.prestamo_id || '')
  const clienteId = String(cliente?.id || pago?.cliente_id || '')
  const pagoIdParam = Array.isArray(params.pago_id) ? params.pago_id[0] : params.pago_id
  const pagoId = typeof pagoIdParam === 'string' ? pagoIdParam.trim() : ''
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
  const emailFinal = String(cliente?.email || usuario?.email || usuario?.correo || 'No registrado')
  const clienteTelefono = String(cliente?.telefono || '')
  const observaciones = ''

  const isEfectivo = metodo.toLowerCase() === 'efectivo'
  const paymentMethodLabel =
    metodo.toLowerCase() === 'mercadopago' || metodo.toLowerCase() === 'mercado_pago'
      ? 'Mercado Pago'
      : metodo
        ? metodo[0]?.toUpperCase() + metodo.slice(1)
        : 'No informado'

  const computedVuelto = isEfectivo ? Math.max(0, Number((montoIngresado - montoAplicado).toFixed(2))) : 0
  const vuelto = isEfectivo
    ? Number.isFinite(Number(vueltoParam))
      ? Number(vueltoParam)
      : computedVuelto
    : 0

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

  const cantidadCuotasImpactadas = cuotasDetalleNormalizadas.length
  const cuotaPrincipal = cuotasDetalleNormalizadas[0] || null
  const saldoRestanteCuota = Number(cuotaPrincipal?.saldo_despues || 0)
  const esPagoParcial = cuotasDetalleNormalizadas.some((item) => Number(item.saldo_despues || 0) > 0)
  const esMultiCuota = cantidadCuotasImpactadas > 1

  const receiptNumber = buildReceiptNumber(pagoId, prestamoId, fechaRaw || fechaFormateada)
  const cuotasTexto = cuotasDetalleNormalizadas.length
    ? cuotasDetalleNormalizadas
        .map((item) => `#${item.numero_cuota}${item.estado ? ` (${String(item.estado || '').toUpperCase()})` : ''}`)
        .join(', ')
    : 'Sin detalle de cuotas impactadas'

  const proximaCuotaTexto = proximaCuota
    ? `Cuota #${proximaCuota}`
    : saldoRestante <= 0
      ? 'Préstamo saldado / sin saldo pendiente'
      : 'Sin próxima cuota informada'

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
            .select('cuota_id,numero_cuota,monto_aplicado,saldo_cuota_antes,saldo_cuota_despues')
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

  const shareText = [
    'Comprobante de pago - Creditodo',
    `Recibo: ${receiptNumber}`,
    `Cliente: ${clienteNombre}`,
    `Monto aplicado: ${formatCurrencyArs(montoAplicado)}`,
    `Método: ${paymentMethodLabel}`,
    `Fecha: ${fechaFormateada}`,
    `Cuotas impactadas: ${cuotasTexto}`,
    `Saldo restante del préstamo: ${formatCurrencyArs(saldoRestante)}`,
  ].join('\n')

  const receiptMetaItems: ReceiptLineItem[] = [
    {
      label: 'Estado',
      value: esPagoParcial ? 'Pago aprobado (PARCIAL)' : 'Pago aprobado (COMPLETO)',
      emphasize: true,
    },
    { label: 'Recibo N.º', value: receiptNumber },
    { label: 'Fecha y hora', value: fechaFormateada },
    { label: 'ID préstamo', value: formatFallback(prestamoId) },
  ]

  const clientItems: ReceiptLineItem[] = [
    { label: 'Nombre completo', value: clienteNombre },
    { label: 'DNI', value: formatFallback(dniFinal, 'No registrado') },
    { label: 'Email', value: formatFallback(emailFinal, 'No registrado') },
    { label: 'ID cliente', value: formatFallback(clienteId) },
  ]

  const paymentItems: ReceiptLineItem[] = [
    { label: 'Método de pago', value: formatFallback(paymentMethodLabel) },
    {
      label: 'Cuotas impactadas',
      value: cantidadCuotasImpactadas ? `${cantidadCuotasImpactadas} (${cuotasTexto})` : 'No informado',
    },
    { label: 'Próxima cuota pendiente', value: proximaCuotaTexto },
    ...(esPagoParcial
      ? [
          {
            label: 'Resultado de aplicación',
            value: 'Pago parcial: quedó saldo pendiente en al menos una cuota.',
            emphasize: true,
          },
        ]
      : []),
  ]

  const financeItems: ReceiptLineItem[] = esMultiCuota
    ? [
        { label: 'Monto total aplicado', value: formatCurrencyArs(montoAplicado), emphasize: true },
        { label: isEfectivo ? 'Monto entregado' : 'Monto acreditado', value: formatCurrencyArs(montoIngresado) },
        ...(isEfectivo ? [{ label: 'Vuelto', value: formatCurrencyArs(vuelto) }] : []),
        {
          label: 'Saldo restante del préstamo',
          value: saldoRestante <= 0 ? 'Préstamo saldado / sin saldo pendiente' : formatCurrencyArs(saldoRestante),
          emphasize: saldoRestante <= 0,
        },
      ]
    : [
        { label: 'Cuota impactada', value: cuotaPrincipal ? `Cuota #${cuotaPrincipal.numero_cuota}` : 'No informada' },
        {
          label: 'Monto de la cuota',
          value: formatCurrencyArs(cuotaPrincipal ? Number(cuotaPrincipal.saldo_antes || 0) : montoAplicado + saldoRestanteCuota),
        },
        { label: 'Monto aplicado', value: formatCurrencyArs(montoAplicado), emphasize: true },
        { label: isEfectivo ? 'Monto entregado' : 'Monto acreditado', value: formatCurrencyArs(montoIngresado) },
        ...(isEfectivo ? [{ label: 'Vuelto', value: formatCurrencyArs(vuelto) }] : []),
        {
          label: 'Saldo restante de la cuota',
          value: saldoRestanteCuota > 0 ? formatCurrencyArs(saldoRestanteCuota) : 'Cuota saldada',
          emphasize: saldoRestanteCuota <= 0,
        },
        {
          label: 'Saldo restante del préstamo',
          value: saldoRestante <= 0 ? 'Préstamo saldado / sin saldo pendiente' : formatCurrencyArs(saldoRestante),
          emphasize: saldoRestante <= 0,
        },
      ]

  const backToPrestamoUrl = prestamoId
    ? `/cliente/${clienteId}?prestamo_id=${prestamoId}`
    : `/cliente/${clienteId}`

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
        <Pressable style={styles.backButton} onPress={() => router.replace('/pagos-pendientes' as any)}>
          <Text style={styles.backButtonText}>Ir a pagos pendientes</Text>
        </Pressable>
      </View>
    )
  }

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

          {esMultiCuota ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Detalle por cuota impactada</Text>
              {cuotasDetalleNormalizadas.map((item) => (
                <View key={`cuota-impactada-${item.numero_cuota}`} style={styles.row}>
                  <Text style={styles.rowValue}>Cuota #{item.numero_cuota}</Text>
                  <Text style={styles.rowLabel}>Monto aplicado: {formatCurrencyArs(item.monto_aplicado || 0)}</Text>
                  <Text style={styles.rowLabel}>Saldo previo: {formatCurrencyArs(item.saldo_antes || 0)}</Text>
                  <Text style={styles.rowLabel}>Saldo posterior: {formatCurrencyArs(item.saldo_despues || 0)}</Text>
                  <Text style={[styles.rowLabel, styles.resultingState]}>
                    Estado resultante: {formatFallback(String(item.estado || '').toUpperCase(), 'NO INFORMADO')}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

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
            onPress={() => router.replace(backToPrestamoUrl as any)}
            nativeID="creditodo-recibo-back"
          >
            <Text style={styles.actionGhostText}>Volver al préstamo</Text>
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
  resultingState: {
    color: '#1D4ED8',
    fontWeight: '700',
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#334155',
    fontWeight: '600',
  },
  deniedTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  deniedText: {
    color: '#475569',
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

// URL de tu backend en producción (Render)
const API_URL = "https://tu-servicio-en-render.onrender.com"; // ¡Recuerda cambiar esto por tu URL real!

// Configuración de Seguridad (PIN)
const PIN_CORRECTO = "1234";
const MAX_INTENTOS = 3;
const TIEMPO_BLOQUEO_MS = 30 * 60 * 1000;

let sesionReportesDesbloqueada = false;

// Estado en memoria
let cierres = [];
let sucursalActualRegistro = 'Santa Barbara';
let sucursalActualReporte = 'Santa Barbara';

const formatoClp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.valueAsDate = new Date();
    
    // Listeners para calcular el saldo en tiempo real
    const inputEfectivo = document.getElementById('efectivo');
    const inputRetiro = document.getElementById('retiro');
    
    if (inputEfectivo && inputRetiro) {
        inputEfectivo.addEventListener('input', calcularSaldoPreview);
        inputRetiro.addEventListener('input', calcularSaldoPreview);
    }
    
    cargarDatosDesdeServidor();
});

// --- COMUNICACIÓN CON LA API ---

async function cargarDatosDesdeServidor() {
    try {
        const resp = await fetch(`${API_URL}/cierres`);
        if (resp.ok) {
            cierres = await resp.json();
            actualizarUI();
        }
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        alert("⚠️ No se pudo cargar el historial desde el servidor.");
    }
}

// --- ACTUALIZACIÓN DE INTERFAZ ---

function actualizarUI() {
    // 1. Actualizar el "Último Saldo Registrado" en la pestaña de Registro
    const cierresSucursal = cierres.filter(c => c.sucursal === sucursalActualRegistro);
    // Como el backend devuelve ordenado por ID descendente, el índice [0] es el más reciente
    const ultimoSaldo = cierresSucursal.length > 0 ? cierresSucursal[0].saldo_final : 0;
    
    document.getElementById('lbl-caja-sucursal').innerText = sucursalActualRegistro;
    document.getElementById('res-saldo-registro').innerText = formatoClp.format(ultimoSaldo);

    // 2. Si la pestaña de reportes está desbloqueada, actualizar los cuadros
    if (sesionReportesDesbloqueada) {
        actualizarReportes();
    }
}

function calcularSaldoPreview() {
    const efectivo = parseFloat(document.getElementById('efectivo').value) || 0;
    const retiro = parseFloat(document.getElementById('retiro').value) || 0;
    const saldoFinal = efectivo - retiro;
    
    document.getElementById('previewSaldo').innerText = formatoClp.format(saldoFinal);
}

// --- NAVEGACIÓN ENTRE PESTAÑAS ---

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
    
    if (tabId === 'reportes') {
        comprobarEstadoPin();
    }
}

function cambiarSucursalRegistro(sucursal, btn) {
    sucursalActualRegistro = sucursal;
    btn.parentElement.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    actualizarUI();
}

function cambiarSucursalReporte(sucursal, btn) {
    sucursalActualReporte = sucursal;
    btn.parentElement.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    actualizarReportes();
}

// --- FORMULARIO DE CIERRE (API POST) ---

document.getElementById('ventaForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const efectivo = parseFloat(document.getElementById('efectivo').value) || 0;
    const retiro = parseFloat(document.getElementById('retiro').value) || 0;
    const saldoFinal = efectivo - retiro;

    if (retiro > efectivo) {
        if (!confirm("⚠️ El retiro que estás marcando es mayor que el efectivo declarado. ¿Confirmar de todas formas?")) {
            return;
        }
    }

    const nuevoCierre = {
        id: Date.now(),
        fecha: document.getElementById('fecha').value,
        sucursal: sucursalActualRegistro,
        empleado: document.getElementById('empleado').value,
        efectivo_en_caja: efectivo,
        retiro: retiro,
        saldo_final: saldoFinal
    };

    try {
        const resp = await fetch(`${API_URL}/cierres`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoCierre)
        });

        if (!resp.ok) throw new Error("Error al guardar el cierre");

        alert(`✅ Cierre registrado exitosamente en ${sucursalActualRegistro}.\nQueda en caja: ${formatoClp.format(saldoFinal)}`);

        // Limpiar formulario y recargar datos
        this.reset();
        document.getElementById('fecha').valueAsDate = new Date();
        document.getElementById('retiro').value = 0;
        calcularSaldoPreview();
        cargarDatosDesdeServidor(); 

    } catch (error) {
        alert("❌ Hubo un problema al conectar con el servidor para guardar el cierre.");
    }
});

// --- SEGURIDAD Y REPORTES ---

function comprobarEstadoPin() {
    const contenedorAuth = document.getElementById('pinAuthContainer');
    const contenido = document.getElementById('contenidoReportes');
    const msg = document.getElementById('pinMsg');
    const input = document.getElementById('inputPin');
    const btnVerificar = contenedorAuth.querySelector('button');

    const bloqueoHasta = parseInt(localStorage.getItem('pinBloqueoHasta') || '0', 10);
    const ahora = Date.now();

    if (bloqueoHasta > ahora) {
        const minutosRestantes = Math.ceil((bloqueoHasta - ahora) / (60 * 1000));
        contenedorAuth.style.display = 'block';
        contenido.style.display = 'none';
        input.disabled = true;
        btnVerificar.disabled = true;
        msg.className = 'pin-msg blocked';
        msg.innerText = `⛔ Acceso bloqueado. Reintenta en ${minutosRestantes} minuto(s).`;
        return;
    } else {
        input.disabled = false;
        btnVerificar.disabled = false;
    }

    if (sesionReportesDesbloqueada) {
        contenedorAuth.style.display = 'none';
        contenido.style.display = 'block';
        actualizarReportes();
    } else {
        contenedorAuth.style.display = 'block';
        contenido.style.display = 'none';
        msg.innerText = '';
        input.value = '';
    }
}

function verificarPin() {
    const input = document.getElementById('inputPin');
    const msg = document.getElementById('pinMsg');
    const pinIngresado = input.value.trim();

    let intentos = parseInt(localStorage.getItem('pinIntentosFallidos') || '0', 10);

    if (pinIngresado === PIN_CORRECTO) {
        sesionReportesDesbloqueada = true;
        localStorage.removeItem('pinIntentosFallidos');
        localStorage.removeItem('pinBloqueoHasta');
        comprobarEstadoPin();
    } else {
        intentos += 1;
        localStorage.setItem('pinIntentosFallidos', intentos);
        input.value = '';

        if (intentos >= MAX_INTENTOS) {
            const tiempoDesbloqueo = Date.now() + TIEMPO_BLOQUEO_MS;
            localStorage.setItem('pinBloqueoHasta', tiempoDesbloqueo);
            localStorage.removeItem('pinIntentosFallidos');
            comprobarEstadoPin();
        } else {
            msg.className = 'pin-msg error';
            msg.innerText = `PIN incorrecto. Te quedan ${MAX_INTENTOS - intentos} intento(s).`;
        }
    }
}

function actualizarReportes() {
    const hoyStr = new Date().toISOString().split('T')[0];
    const mesActual = hoyStr.substring(0, 7);
    
    let totalDia = 0, totalMes = 0, totalRetirosDia = 0;

    cierres.forEach(c => {
        if (c.sucursal === sucursalActualReporte) {
            if (c.fecha === hoyStr) {
                totalDia += c.efectivo_en_caja;
                totalRetirosDia += c.retiro;
            }
            if (c.fecha.startsWith(mesActual)) {
                totalMes += c.efectivo_en_caja;
            }
        }
    });

    document.getElementById('titulo-reporte-sucursal').innerText = `Resumen - ${sucursalActualReporte}`;
    document.getElementById('res-dia').innerText = formatoClp.format(totalDia);
    document.getElementById('res-mes').innerText = formatoClp.format(totalMes);
    document.getElementById('res-ret').innerText = formatoClp.format(totalRetirosDia);
}

// --- EXPORTAR A EXCEL ---

function exportarExcel() {
    if (cierres.length === 0) {
        alert("No hay registros en la base de datos para exportar.");
        return;
    }

    const desde = document.getElementById('filtro-desde').value;
    const hasta = document.getElementById('filtro-hasta').value;
    const sucursal = document.getElementById('filtro-sucursal').value;
    const empleado = document.getElementById('filtro-empleado').value;

    let datosFiltrados = cierres.filter(c => {
        let okDesde = desde ? c.fecha >= desde : true;
        let okHasta = hasta ? c.fecha <= hasta : true;
        let okSucursal = sucursal === "Todas" ? true : c.sucursal === sucursal;
        let okEmpleado = empleado === "Todos" ? true : c.empleado === empleado;
        return okDesde && okHasta && okSucursal && okEmpleado;
    });

    if (datosFiltrados.length === 0) {
        alert("No hay registros que coincidan con esos filtros.");
        return;
    }

    // Mapeo limpio para que las columnas en Excel tengan nombres correctos
    const dataExcel = datosFiltrados.map(c => ({
        "Fecha": c.fecha,
        "Sucursal": c.sucursal,
        "Empleado": c.empleado,
        "Efectivo en Caja ($)": c.efectivo_en_caja,
        "Retiro ($)": c.retiro,
        "Saldo Final ($)": c.saldo_final
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cierres_Caja");
    
    XLSX.writeFile(workbook, `Reporte_Caja_${new Date().toISOString().split('T')[0]}.xlsx`);
}
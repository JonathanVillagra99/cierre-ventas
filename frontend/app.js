// URL de la API de FastAPI
const API_URL = "http://127.0.0.1:8000";

// Configuración de Seguridad (PIN)
const PIN_CORRECTO = "1234";
const MAX_INTENTOS = 3;
const TIEMPO_BLOQUEO_MS = 30 * 60 * 1000;

let sesionReportesDesbloqueada = false;

// Estado en memoria
let ventas = [];
let saldosCaja = {
    "Santa Barbara": 0,
    "Ralco": 0
};

let sucursalActualRegistro = 'Santa Barbara';
let sucursalActualReporte = 'Santa Barbara';

const formatoClp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.valueAsDate = new Date();
    
    // Cargar datos iniciales desde el servidor
    cargarDatosDesdeServidor();
});

// --- COMUNICACIÓN CON LA API (FETCH) ---

async function cargarDatosDesdeServidor() {
    try {
        // 1. Obtener saldos de caja
        const respCajas = await fetch(`${API_URL}/caja`);
        if (respCajas.ok) {
            saldosCaja = await respCajas.json();
            actualizarCajaRegistro();
        }

        // 2. Obtener historial de ventas
        const respVentas = await fetch(`${API_URL}/ventas`);
        if (respVentas.ok) {
            ventas = await respVentas.json();
        }
    } catch (error) {
        console.error("Error al conectar con la API:", error);
        alert("⚠️ No se pudo conectar con el servidor backend. Asegúrate de que Uvicorn esté corriendo.");
    }
}

// --- NAVEGACIÓN ENTRE PESTAÑAS ---

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
    
    if (tabId === 'reportes') {
        comprobarEstadoPin();
    } else if (tabId === 'registro') {
        cargarDatosDesdeServidor();
    }
}

function cambiarSucursalRegistro(sucursal, btn) {
    sucursalActualRegistro = sucursal;
    btn.parentElement.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    actualizarCajaRegistro();
}

function cambiarSucursalReporte(sucursal, btn) {
    sucursalActualReporte = sucursal;
    btn.parentElement.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('titulo-reporte-sucursal').innerText = `Resumen de Hoy - ${sucursal}`;
    actualizarReportes();
}

// --- GESTIÓN DE CAJA (API) ---

function actualizarCajaRegistro() {
    const saldoActual = saldosCaja[sucursalActualRegistro] || 0;
    document.getElementById('lbl-caja-sucursal').innerText = sucursalActualRegistro;
    document.getElementById('res-saldo-registro').innerText = formatoClp.format(saldoActual);
}

async function inyectarEfectivo() {
    const input = document.getElementById('monto-ajuste');
    const monto = parseFloat(input.value);
    
    if (!monto || monto <= 0) {
        alert("Ingresa un monto válido mayor a 0.");
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/caja/${encodeURIComponent(sucursalActualRegistro)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto: monto, operacion: "inyectar" })
        });

        if (!resp.ok) throw new Error("Error en la respuesta del servidor");

        const data = await resp.json();
        saldosCaja[sucursalActualRegistro] = data.nuevo_saldo;
        
        input.value = '';
        actualizarCajaRegistro();
        alert(`Se agregaron ${formatoClp.format(monto)} a ${sucursalActualRegistro}.`);
    } catch (error) {
        alert("Error al actualizar la caja en la base de datos.");
    }
}

async function fijarEfectivo() {
    const input = document.getElementById('monto-ajuste');
    const monto = parseFloat(input.value);
    
    if (isNaN(monto) || monto < 0) {
        alert("Ingresa un monto válido (0 o superior).");
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/caja/${encodeURIComponent(sucursalActualRegistro)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto: monto, operacion: "fijar" })
        });

        if (!resp.ok) throw new Error("Error en la respuesta del servidor");

        const data = await resp.json();
        saldosCaja[sucursalActualRegistro] = data.nuevo_saldo;

        input.value = '';
        actualizarCajaRegistro();
        alert(`Efectivo de ${sucursalActualRegistro} modificado a ${formatoClp.format(monto)}.`);
    } catch (error) {
        alert("Error al actualizar la caja en la base de datos.");
    }
}

// --- FORMULARIO DE CIERRE (API) ---

document.getElementById('ventaForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const general = parseFloat(document.getElementById('totalVentas').value) || 0;
    const efectivo = parseFloat(document.getElementById('efectivo').value) || 0;
    const debito = parseFloat(document.getElementById('debito').value) || 0;
    const transferencia = parseFloat(document.getElementById('transferencia').value) || 0;
    const retiro = parseFloat(document.getElementById('retiro').value) || 0;
    
    if (general !== (efectivo + debito + transferencia)) {
        if (!confirm("⚠️ El total general no coincide con la suma de pagos. ¿Deseas guardarlo de todas formas?")) {
            return;
        }
    }

    const nuevoRegistro = {
        id: Date.now(),
        fecha: document.getElementById('fecha').value,
        sucursal: sucursalActualRegistro,
        empleado: document.getElementById('empleado').value,
        totalGeneral: general,
        efectivo: efectivo,
        debito: debito,
        transferencia: transferencia,
        retiro: retiro,
        saldoCaja: 0 // El backend calcula el saldo final real
    };

    try {
        const resp = await fetch(`${API_URL}/ventas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoRegistro)
        });

        if (!resp.ok) throw new Error("Error al guardar el cierre");

        const data = await resp.json();
        saldosCaja[sucursalActualRegistro] = data.nuevo_saldo_caja;

        alert(`¡Cierre guardado en MongoDB! Nuevo saldo en caja: ${formatoClp.format(data.nuevo_saldo_caja)}`);

        this.reset();
        document.getElementById('fecha').valueAsDate = new Date();
        actualizarCajaRegistro();
        
        // Refrescar registros locales
        const respVentas = await fetch(`${API_URL}/ventas`);
        if (respVentas.ok) ventas = await respVentas.json();

    } catch (error) {
        alert("Hubo un problema al conectar con el servidor para guardar la venta.");
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

async function actualizarReportes() {
    // Traer los datos más recientes antes de recalcular
    try {
        const resp = await fetch(`${API_URL}/ventas`);
        if (resp.ok) ventas = await resp.json();
    } catch (e) {
        console.error("No se pudo refrescar el reporte", e);
    }

    const hoyStr = new Date().toISOString().split('T')[0];
    const mesActual = hoyStr.substring(0, 7);
    
    let totalDia = 0, totalMes = 0, tEfe = 0, tDeb = 0, tTra = 0, tRet = 0;

    ventas.forEach(v => {
        if (v.sucursal === sucursalActualReporte) {
            if (v.fecha === hoyStr) {
                totalDia += v.totalGeneral;
                tEfe += v.efectivo;
                tDeb += v.debito;
                tTra += v.transferencia;
                tRet += v.retiro;
            }
            if (v.fecha.startsWith(mesActual)) {
                totalMes += v.totalGeneral;
            }
        }
    });

    document.getElementById('res-dia').innerText = formatoClp.format(totalDia);
    document.getElementById('res-mes').innerText = formatoClp.format(totalMes);
    document.getElementById('res-ret').innerText = formatoClp.format(tRet);
    document.getElementById('res-efe').innerText = formatoClp.format(tEfe);
    document.getElementById('res-deb').innerText = formatoClp.format(tDeb);
    document.getElementById('res-tra').innerText = formatoClp.format(tTra);
}

// --- EXPORTAR A EXCEL ---

function exportarExcel() {
    if (ventas.length === 0) {
        alert("No hay registros para exportar.");
        return;
    }

    const desde = document.getElementById('filtro-desde').value;
    const hasta = document.getElementById('filtro-hasta').value;
    const sucursal = document.getElementById('filtro-sucursal').value;
    const empleado = document.getElementById('filtro-empleado').value;

    let datosFiltrados = ventas.filter(v => {
        let okDesde = desde ? v.fecha >= desde : true;
        let okHasta = hasta ? v.fecha <= hasta : true;
        let okSucursal = sucursal === "Todas" ? true : v.sucursal === sucursal;
        let okEmpleado = empleado === "Todos" ? true : v.empleado === empleado;
        return okDesde && okHasta && okSucursal && okEmpleado;
    });

    if (datosFiltrados.length === 0) {
        alert("No hay registros con los filtros seleccionados.");
        return;
    }

    const dataExcel = datosFiltrados.map(v => ({
        "Fecha": v.fecha,
        "Sucursal": v.sucursal,
        "Empleado": v.empleado,
        "Venta Total": v.totalGeneral,
        "Efectivo": v.efectivo,
        "Débito/Crédito": v.debito,
        "Transferencia": v.transferencia,
        "Retiro de Caja": v.retiro,
        "Caja Final": v.saldoCaja
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    
    XLSX.writeFile(workbook, `Reporte_${new Date().toISOString().split('T')[0]}.xlsx`);
}
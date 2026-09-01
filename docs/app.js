const API_URL = "https://tu-servicio-en-render.onrender.com"; // O http://127.0.0.1:8000 en local

let cierres = [];
const formatoClp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

document.addEventListener('DOMContentLoaded', () => {
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.valueAsDate = new Date();

    const inputEfectivo = document.getElementById('efectivo');
    const inputRetiro = document.getElementById('retiro');

    if (inputEfectivo && inputRetiro) {
        inputEfectivo.addEventListener('input', calcularSaldoPreview);
        inputRetiro.addEventListener('input', calcularSaldoPreview);
    }

    cargarCierres();
});

// Cálculo reactivo en tiempo real
function calcularSaldoPreview() {
    const efectivo = parseFloat(document.getElementById('efectivo').value) || 0;
    const retiro = parseFloat(document.getElementById('retiro').value) || 0;
    const saldoFinal = efectivo - retiro;

    document.getElementById('previewSaldo').innerText = formatoClp.format(saldoFinal);
}

// Cargar registros desde la API
async function cargarCierres() {
    try {
        const resp = await fetch(`${API_URL}/cierres`);
        if (resp.ok) {
            cierres = await resp.json();
            actualizarReporte();
        }
    } catch (error) {
        console.error("Error al cargar cierres:", error);
    }
}

// Enviar formulario
document.getElementById('formCierre').addEventListener('submit', async function(e) {
    e.preventDefault();

    const efectivo = parseFloat(document.getElementById('efectivo').value) || 0;
    const retiro = parseFloat(document.getElementById('retiro').value) || 0;
    const saldoFinal = efectivo - retiro;

    if (retiro > efectivo) {
        if (!confirm("⚠️ El retiro es mayor que el efectivo declarado. ¿Confirmar de todas formas?")) {
            return;
        }
    }

    const nuevoCierre = {
        id: Date.now(),
        fecha: document.getElementById('fecha').value,
        sucursal: document.getElementById('sucursal').value,
        empleado: document.getElementById('empleado').value.trim(),
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

        if (!resp.ok) throw new Error("Error en el servidor");

        alert(`✅ Cierre registrado.\nEfectivo: ${formatoClp.format(efectivo)}\nRetiro: ${formatoClp.format(retiro)}\nQueda en caja: ${formatoClp.format(saldoFinal)}`);
        
        this.reset();
        document.getElementById('fecha').valueAsDate = new Date();
        document.getElementById('retiro').value = 0;
        calcularSaldoPreview();
        cargarCierres();

    } catch (err) {
        alert("❌ Error al guardar el cierre. Verifica la conexión.");
    }
});

// Exportación ajustada a Excel
function exportarExcel() {
    if (cierres.length === 0) {
        alert("No hay registros para exportar.");
        return;
    }

    const dataExcel = cierres.map(c => ({
        "Fecha": c.fecha,
        "Sucursal": c.sucursal,
        "Empleado": c.empleado,
        "Efectivo en Caja": c.efectivo_en_caja,
        "Monto Retiro": c.retiro,
        "Saldo Final que Queda en Caja": c.saldo_final
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cierres_Diarios");

    XLSX.writeFile(workbook, `Reporte_Cierres_${new Date().toISOString().split('T')[0]}.xlsx`);
}
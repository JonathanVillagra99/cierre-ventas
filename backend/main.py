import certifi
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager

# Reemplaza con tu URI real
MONGO_DETAILS = "mongodb+srv://jonathanvillagra0806_db_user:pewen1234@cierre-ventas.zwmfqpf.mongodb.net/?appName=cierre-ventas"

# Cliente con soporte SSL para Windows
client = AsyncIOMotorClient(MONGO_DETAILS, tlsCAFile=certifi.where())
database = client.sistema_ventas
coleccion_ventas = database.get_collection("ventas")
coleccion_cajas = database.get_collection("saldos_caja")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicialización segura al arrancar
    try:
        cajas = await coleccion_cajas.find_one({"_id": "cajas_locales"})
        if not cajas:
            await coleccion_cajas.insert_one({
                "_id": "cajas_locales",
                "Santa Barbara": 0,
                "Ralco": 0
            })
        print("✅ Conectado exitosamente a MongoDB Atlas")
    except Exception as e:
        print(f"❌ Error al conectar a MongoDB: {e}")
    yield

app = FastAPI(title="API Cierre de Ventas", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos
class Venta(BaseModel):
    id: int
    fecha: str
    sucursal: str
    empleado: str
    totalGeneral: float
    efectivo: float
    debito: float
    transferencia: float
    retiro: float
    saldoCaja: float

class AjusteCaja(BaseModel):
    monto: float
    operacion: str

# Endpoints
@app.get("/caja")
async def obtener_caja():
    cajas = await coleccion_cajas.find_one({"_id": "cajas_locales"})
    if cajas:
        return {"Santa Barbara": cajas.get("Santa Barbara", 0), "Ralco": cajas.get("Ralco", 0)}
    return {"Santa Barbara": 0, "Ralco": 0}

@app.put("/caja/{sucursal}")
async def actualizar_caja(sucursal: str, ajuste: AjusteCaja):
    cajas = await coleccion_cajas.find_one({"_id": "cajas_locales"})
    saldo_actual = cajas.get(sucursal, 0) if cajas else 0

    if ajuste.operacion == "inyectar":
        nuevo_saldo = saldo_actual + ajuste.monto
    elif ajuste.operacion == "fijar":
        nuevo_saldo = ajuste.monto
    else:
        raise HTTPException(status_code=400, detail="Operación no válida")

    await coleccion_cajas.update_one(
        {"_id": "cajas_locales"},
        {"$set": {sucursal: nuevo_saldo}},
        upsert=True
    )
    return {"mensaje": "Caja actualizada", "nuevo_saldo": nuevo_saldo}

@app.get("/ventas")
async def obtener_ventas():
    ventas = []
    cursor = coleccion_ventas.find({})
    async for documento in cursor:
        documento["_id"] = str(documento["_id"])
        ventas.append(documento)
    return ventas

@app.post("/ventas")
async def registrar_venta(venta: Venta):
    venta_dict = venta.model_dump() if hasattr(venta, "model_dump") else venta.dict()
    await coleccion_ventas.insert_one(venta_dict)

    cajas = await coleccion_cajas.find_one({"_id": "cajas_locales"})
    saldo_actual = cajas.get(venta.sucursal, 0) if cajas else 0
    nuevo_saldo = saldo_actual + venta.efectivo - venta.retiro

    await coleccion_cajas.update_one(
        {"_id": "cajas_locales"},
        {"$set": {venta.sucursal: nuevo_saldo}}
    )

    return {"mensaje": "Cierre registrado exitosamente", "nuevo_saldo_caja": nuevo_saldo}
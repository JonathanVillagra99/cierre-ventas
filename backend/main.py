import os
import certifi
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
MONGO_DETAILS = os.getenv("MONGO_URI")

# Conexión a MongoDB Atlas
client = AsyncIOMotorClient(MONGO_DETAILS, tlsCAFile=certifi.where())
database = client.sistema_cierres
coleccion_cierres = database.get_collection("cierres")

app = FastAPI(title="API Cierre Diario de Caja")

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo de datos simplificado
class CierreDiario(BaseModel):
    id: int
    fecha: str
    sucursal: str
    empleado: str
    efectivo_en_caja: float
    retiro: float = 0.0
    saldo_final: float

@app.get("/cierres")
async def obtener_cierres():
    cierres = []
    # Ordena del más reciente al más antiguo
    cursor = coleccion_cierres.find({}).sort("id", -1) 
    async for documento in cursor:
        documento["_id"] = str(documento["_id"])
        cierres.append(documento)
    return cierres

@app.post("/cierres")
async def registrar_cierre(cierre: CierreDiario):
    # Validamos que el saldo final siempre sea la resta exacta
    cierre.saldo_final = cierre.efectivo_en_caja - cierre.retiro
    cierre_dict = cierre.model_dump() if hasattr(cierre, "model_dump") else cierre.dict()
    
    await coleccion_cierres.insert_one(cierre_dict)
    return {"mensaje": "Cierre registrado exitosamente", "saldo_final": cierre.saldo_final}
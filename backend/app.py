from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient, ReturnDocument
from dotenv import load_dotenv
from passlib.context import CryptContext
from bson import ObjectId
from collections import defaultdict
from typing import Optional
import jwt
import os
import base64
import uuid
import certifi
import cloudinary
import cloudinary.uploader
import razorpay
import hmac
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
import builtins

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

app = FastAPI()

# ── Static files for dish images (admin menu upload) ──
IMAGES_DIR = Path(__file__).parent / "images"
IMAGES_DIR.mkdir(exist_ok=True)
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://sheher-garden-cafe.netlify.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Explicit OPTIONS handler ──
# Catches CORS preflight requests and always returns correct headers,
# even if FastAPI's middleware hasn't fully initialised yet.
from fastapi import Request
from fastapi.responses import Response as FastAPIResponse

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str, request: Request):
    origin = request.headers.get("origin", "https://sheher-garden-cafe.netlify.app")
    allowed = origin if origin in ALLOWED_ORIGINS else "https://sheher-garden-cafe.netlify.app"
    return FastAPIResponse(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin":      allowed,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods":     "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers":     "Authorization, Content-Type",
            "Access-Control-Max-Age":           "86400",
        }
    )

# ══════════════════════════════════════════════════
# CLOUDINARY
# Add ONE of these to your .env:
#   Option A (recommended): CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
#   Option B: CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
# ══════════════════════════════════════════════════
# Parse CLOUDINARY_URL manually — avoids SDK parsing bugs
# Format: cloudinary://api_key:api_secret@cloud_name
_cld_url = os.getenv("CLOUDINARY_URL", "")
if _cld_url.startswith("cloudinary://"):
    _cld_body   = _cld_url[len("cloudinary://"):]          # api_key:api_secret@cloud_name
    _cld_key, _rest = _cld_body.split(":", 1)              # api_key  |  api_secret@cloud_name
    _cld_secret, _cld_cloud = _rest.rsplit("@", 1)         # api_secret  |  cloud_name
    cloudinary.config(
        cloud_name = _cld_cloud.strip(),
        api_key    = _cld_key.strip(),
        api_secret = _cld_secret.strip(),
        secure     = True,
    )
else:
    cloudinary.config(
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key    = os.getenv("CLOUDINARY_API_KEY"),
        api_secret = os.getenv("CLOUDINARY_API_SECRET"),
        secure     = True,
    )

# ══════════════════════════════════════════════════
# RAZORPAY
# ══════════════════════════════════════════════════
RAZORPAY_KEY_ID     = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# ══════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════
MONGODB_URI = os.getenv("MONGODB_URI")
JWT_SECRET  = os.getenv("JWT_SECRET", "CHANGE_ME_LATER")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is missing. Check backend/.env file.")

client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
client.admin.command("ping")

db           = client["sheher_garden_db"]
users_col    = db["users"]
orders_col   = db["orders"]
coupons_col  = db["coupons"]
settings_col = db["settings"]
gallery_col  = db["gallery"]

# ══════════════════════════════════════════════════
# SECURITY
# ══════════════════════════════════════════════════
pwd_context          = CryptContext(schemes=["bcrypt"], deprecated="auto")
auth_scheme          = HTTPBearer()
optional_auth_scheme = HTTPBearer(auto_error=False)

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)

def create_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": datetime.utcnow() + timedelta(days=7)},
        JWT_SECRET, algorithm="HS256",
    )

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(auth_scheme)) -> dict:
    payload = decode_token(creds.credentials)
    user    = users_col.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user["_id"], "name": user.get("name",""), "email": user["email"], "role": user.get("role","user")}

def get_optional_user(creds: HTTPAuthorizationCredentials = Depends(optional_auth_scheme)):
    if not creds:
        return None
    try:
        payload = decode_token(creds.credentials)
        user    = users_col.find_one({"_id": payload["sub"]})
        if not user:
            return None
        return {"id": user["_id"], "name": user.get("name",""), "email": user["email"], "role": user.get("role","user")}
    except Exception:
        return None

def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ══════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════
def save_image(image_value: str, old_filename: str = "") -> str:
    """Base64 image → save to disk. Plain filename → return as-is."""
    if not image_value:
        return old_filename or ""
    if image_value.startswith("data:image/"):
        try:
            header, b64data = image_value.split(",", 1)
            ext = header.split(";")[0].split("/")[1]
            ext = ext if ext in ("jpeg","jpg","png","gif","webp") else "jpg"
            ext = "jpg" if ext == "jpeg" else ext
            filename = f"dish_{uuid.uuid4().hex[:12]}.{ext}"
            with open(IMAGES_DIR / filename, "wb") as f:
                f.write(base64.b64decode(b64data))
            return filename
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")
    return image_value

def menu_item_serializer(item: dict) -> dict:
    item["_id"] = str(item["_id"]); return item

def order_serializer(order: dict) -> dict:
    order["_id"] = str(order["_id"]); return order

def coupon_serializer(coupon: dict) -> dict:
    coupon["_id"] = str(coupon["_id"]); return coupon

def get_settings_doc() -> dict:
    doc = settings_col.find_one({"_id": "global"})
    if not doc:
        default = {"_id":"global","delivery_charge":30,"free_delivery_above":500,"min_order_value":250,"estimated_delivery_time":"30–45 minutes"}
        settings_col.insert_one(default)
        return default
    return doc

def gallery_serializer(post: dict, viewer_id: str = "") -> dict:
    post["_id"]       = str(post["_id"])
    likes             = post.get("likes", [])
    post["likes"]     = likes
    post["likeCount"] = len(likes)
    post["hasLiked"]  = viewer_id in likes if viewer_id else False
    post["reportCount"] = len(post.get("reports", []))
    post.pop("reports", None)
    # Stringify datetime so FastAPI JSON encoder does not crash
    if isinstance(post.get("created_at"), datetime):
        post["createdAt"] = post["created_at"].isoformat()
    post.pop("created_at", None)
    return post


# ══════════════════════════════════════════════════
# CORE ROUTES
# ══════════════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "Sheher Garden Backend Running"}

@app.get("/test-db")
def test_db():
    return {"status": "MongoDB ping successful"}

@app.post("/api/signup")
def signup(payload: dict):
    name = payload.get("name","").strip()
    phone = payload.get("phone","").strip()
    email = payload.get("email","").strip().lower()
    password = payload.get("password","")
    if not name or not email or not password:
        raise HTTPException(400, "Name, email and password are required")
    if phone and (not phone.isdigit() or len(phone) != 10):
        raise HTTPException(400, "Phone must be a 10-digit number")
    if users_col.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    users_col.insert_one({"_id":email,"name":name,"phone":phone,"email":email,"password_hash":hash_password(password),"role":"user","created_at":datetime.utcnow()})
    return {"message":"Signup successful","token":create_token(email,"user"),"role":"user"}

@app.post("/api/login")
def login(payload: dict):
    email = payload.get("email","").strip().lower()
    password = payload.get("password","")
    user = users_col.find_one({"email": email})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    role = user.get("role","user")
    return {"message":"Login successful","token":create_token(user["_id"],role),"role":role}

@app.get("/api/me")
def me(user=Depends(get_current_user)):
    doc = users_col.find_one({"_id": user["id"]})
    phone = doc.get("phone", "") if doc else ""
    return {"id":user["id"],"name":user["name"],"email":user["email"],"role":user["role"],"phone":phone}

@app.get("/api/me/address")
def get_my_address(user=Depends(get_current_user)):
    doc = users_col.find_one({"_id": user["id"]})
    if not doc:
        raise HTTPException(404, "User not found")
    addr = doc.get("saved_address")
    if not addr:
        return {"address": None}
    return {"address": addr}

@app.put("/api/me/address")
def save_my_address(payload: dict, user=Depends(get_current_user)):
    required = ["name", "phone", "line1", "city", "pincode"]
    for field in required:
        if not payload.get(field, "").strip():
            raise HTTPException(400, f"'{field}' is required")
    if not payload["phone"].strip().isdigit() or len(payload["phone"].strip()) != 10:
        raise HTTPException(400, "Phone must be a 10-digit number")
    if not payload["pincode"].strip().isdigit() or len(payload["pincode"].strip()) != 6:
        raise HTTPException(400, "Pincode must be a 6-digit number")
    addr = {
        "name":     payload["name"].strip(),
        "phone":    payload["phone"].strip(),
        "line1":    payload["line1"].strip(),
        "city":     payload["city"].strip(),
        "pincode":  payload["pincode"].strip(),
        "landmark": payload.get("landmark", "").strip(),
    }
    users_col.update_one({"_id": user["id"]}, {"$set": {"saved_address": addr}})
    return {"message": "Address saved", "address": addr}

@app.get("/api/admin/ping")
def admin_ping(admin=Depends(require_admin)):
    return {"message":"Admin route working","admin":admin["email"]}


# ══════════════════════════════════════════════════
# MENU (public read)
# ══════════════════════════════════════════════════

@app.get("/api/menu")
def get_menu(all: bool = False, user=Depends(get_optional_user)):
    # Admin can pass ?all=true to see hidden items; public only sees available ones
    is_admin = user and user.get("role") == "admin"
    query = {} if (all and is_admin) else {"available": {"$ne": False}}
    return [menu_item_serializer(i) for i in db["menu"].find(query)]

@app.get("/api/menu/categories")
def get_categories(user=Depends(get_optional_user)):
    """Return distinct categories, each with one dish image."""
    is_admin = user and user.get("role") == "admin"
    query = {} if is_admin else {"available": {"$ne": False}}
    items = list(db["menu"].find(query, {"category": 1, "image": 1, "name": 1}))
    seen = {}
    for item in items:
        cat = item.get("category", "")
        if cat and cat not in seen:
            seen[cat] = {
                "name": cat,
                "image": item.get("image", ""),
                "sample_dish": item.get("name", ""),
            }
    # Also include categories added manually (even if no dishes yet)
    manual_cats = list(db["categories"].find({}))
    for mc in manual_cats:
        name = mc.get("name", "")
        if name and name not in seen:
            seen[name] = {"name": name, "image": "", "sample_dish": ""}
    return list(seen.values())

@app.post("/api/menu/categories")
def add_category(payload: dict, admin=Depends(require_admin)):
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Category name is required")
    existing = db["menu"].find_one({"category": name})
    if existing:
        raise HTTPException(409, f"Category '{name}' already exists")
    db["categories"].update_one(
        {"_id": name},
        {"$setOnInsert": {"_id": name, "name": name, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"message": f"Category '{name}' added", "name": name}

@app.get("/api/menu/{category}")
def get_menu_by_category(category: str):
    return [menu_item_serializer(i) for i in db["menu"].find({"category": category, "available": {"$ne": False}})]


# ══════════════════════════════════════════════════
# SETTINGS
# ══════════════════════════════════════════════════

@app.get("/api/settings")
def get_settings():
    doc = get_settings_doc(); doc.pop("_id", None); return doc

@app.put("/api/settings")
def update_settings(payload: dict, admin=Depends(require_admin)):
    allowed = {"delivery_charge","free_delivery_above","min_order_value","estimated_delivery_time"}
    update_data = {k:v for k,v in payload.items() if k in allowed}
    if not update_data:
        raise HTTPException(400, "No valid fields to update")
    settings_col.update_one({"_id":"global"},{"$set":update_data},upsert=True)
    return {"message":"Settings updated","updated":update_data}


# ══════════════════════════════════════════════════
# COUPONS
# ══════════════════════════════════════════════════

@app.get("/api/coupons")
def list_coupons(admin=Depends(require_admin)):
    return [coupon_serializer(c) for c in coupons_col.find({})]

@app.post("/api/coupons")
def create_coupon(payload: dict, admin=Depends(require_admin)):
    code = payload.get("code","").strip().upper()
    discount_percent = payload.get("discount_percent")
    if not code or discount_percent is None:
        raise HTTPException(400, "code and discount_percent are required")
    if not (1 <= int(discount_percent) <= 100):
        raise HTTPException(400, "discount_percent must be between 1 and 100")
    if coupons_col.find_one({"code": code}):
        raise HTTPException(409, "Coupon code already exists")
    doc = {"code":code,"discount_percent":int(discount_percent),"first_time_only":payload.get("first_time_only",True),"active":payload.get("active",True),"created_at":datetime.utcnow()}
    result = coupons_col.insert_one(doc); doc["_id"] = str(result.inserted_id)
    return {"message":"Coupon created","coupon":doc}

@app.put("/api/coupons/{code}")
def update_coupon(code: str, payload: dict, admin=Depends(require_admin)):
    code = code.upper()
    allowed = {"discount_percent","first_time_only","active"}
    update_data = {k:v for k,v in payload.items() if k in allowed}
    if not update_data:
        raise HTTPException(400, "No valid fields to update")
    result = coupons_col.update_one({"code":code},{"$set":update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    return {"message":"Coupon updated"}

@app.delete("/api/coupons/{code}")
def delete_coupon(code: str, admin=Depends(require_admin)):
    result = coupons_col.delete_one({"code": code.upper()})
    if result.deleted_count == 0:
        raise HTTPException(404, "Coupon not found")
    return {"message":"Coupon deleted"}

@app.post("/api/coupons/validate")
def validate_coupon(payload: dict, user=Depends(get_optional_user)):
    code = payload.get("code","").strip().upper()
    subtotal = payload.get("subtotal", 0)
    if not code:
        raise HTTPException(400, "Coupon code is required")
    coupon = coupons_col.find_one({"code": code})
    if not coupon:
        return {"valid":False,"message":"Invalid coupon code"}
    if not coupon.get("active", True):
        return {"valid":False,"message":"This coupon is no longer active"}
    if coupon.get("first_time_only", False):
        if not user:
            return {"valid":False,"message":"Please log in to use this coupon — it's for first-time users only"}
        prev = orders_col.count_documents({"user_email":user["email"],"status":{"$in":["paid","confirmed","delivered"]}})
        if prev > 0:
            return {"valid":False,"message":"This coupon is valid for first-time orders only"}
    pct = coupon["discount_percent"]
    return {"valid":True,"discount_percent":pct,"discount_amount":round(subtotal*pct/100,2),"message":f"{pct}% off applied!"}


# ══════════════════════════════════════════════════
# ORDERS
# ══════════════════════════════════════════════════

@app.post("/api/orders")
def place_order(payload: dict, user=Depends(get_optional_user)):
    order_type     = payload.get("order_type","").strip()
    customer_name  = payload.get("customer_name","").strip()
    customer_phone = payload.get("customer_phone","").strip()
    items          = payload.get("items",[])
    subtotal       = payload.get("subtotal",0)
    total          = payload.get("total",0)

    if not order_type or order_type not in ("delivery","dine-in"):
        raise HTTPException(400, "order_type must be 'delivery' or 'dine-in'")
    if not customer_name:
        raise HTTPException(400, "customer_name is required")
    if not customer_phone:
        raise HTTPException(400, "customer_phone is required")
    if not items:
        raise HTTPException(400, "Order must have at least one item")

    if order_type == "delivery":
        address = payload.get("address",{})
        if not address.get("line1") or not address.get("city") or not address.get("pincode"):
            raise HTTPException(400, "Full delivery address is required")
    else:
        address = {}

    settings = get_settings_doc()
    if subtotal < settings["min_order_value"]:
        raise HTTPException(400, f"Minimum order value is ₹{settings['min_order_value']}")

    doc = {
        "order_type":order_type,"customer_name":customer_name,"customer_phone":customer_phone,
        "address":address,"items":items,"subtotal":subtotal,
        "coupon_code":payload.get("coupon_code"),"discount_amount":payload.get("discount_amount",0),
        "delivery_charge":payload.get("delivery_charge",0),"total":total,"notes":payload.get("notes",""),
        "status":"pending","payment_status":"pending","payment_method":"pending",
        "created_at":datetime.utcnow(),"updated_at":datetime.utcnow(),
        "user_email":user["email"] if user else None,"user_name":user["name"] if user else None,
    }
    result = orders_col.insert_one(doc)
    return {"message":"Order placed successfully","order_id":str(result.inserted_id),"status":"pending"}

@app.get("/api/orders")
def get_all_orders(admin=Depends(require_admin)):
    # Exclude archived orders by default
    return [order_serializer(o) for o in orders_col.find({"archived": {"$ne": True}}).sort("created_at", -1)]

@app.put("/api/orders/{order_id}/archive")
def archive_order(order_id: str, admin=Depends(require_admin)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(400, "Invalid order ID")
    result = orders_col.update_one({"_id": oid}, {"$set": {"archived": True, "updated_at": datetime.utcnow()}})
    if result.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"message": "Order archived"}

@app.get("/api/orders/my")
def get_my_orders(user=Depends(get_current_user)):
    return [order_serializer(o) for o in orders_col.find({"user_email":user["email"]}).sort("created_at",-1)]

@app.get("/api/orders/{order_id}")
def get_order(order_id: str, user=Depends(get_optional_user)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(400, "Invalid order ID")
    order = orders_col.find_one({"_id": oid})
    if not order:
        raise HTTPException(404, "Order not found")
    if user and user["role"] != "admin" and order.get("user_email") != user["email"]:
        raise HTTPException(403, "Access denied")
    return order_serializer(order)

@app.put("/api/orders/{order_id}/status")
def update_order_status(order_id: str, payload: dict, admin=Depends(require_admin)):
    valid = {"pending","confirmed","preparing","out_for_delivery","delivered","cancelled"}
    new_status = payload.get("status","").strip()
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Choose from: {valid}")
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(400, "Invalid order ID")
    result = orders_col.update_one({"_id":oid},{"$set":{"status":new_status,"updated_at":datetime.utcnow()}})
    if result.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"message":"Order status updated","status":new_status}

@app.put("/api/orders/{order_id}/payment")
def update_payment_status(order_id: str, payload: dict, admin=Depends(require_admin)):
    try:
        oid = ObjectId(order_id)
    except Exception:
        raise HTTPException(400, "Invalid order ID")
    result = orders_col.update_one({"_id":oid},{"$set":{"payment_status":payload.get("payment_status","paid"),"payment_method":payload.get("payment_method","manual"),"updated_at":datetime.utcnow()}})
    if result.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"message":"Payment status updated"}


# ══════════════════════════════════════════════════
# MENU MANAGEMENT (Admin CRUD)
# ══════════════════════════════════════════════════

@app.post("/api/menu")
def add_menu_item(payload: dict, admin=Depends(require_admin)):
    name = payload.get("name","").strip()
    category = payload.get("category","").strip()
    price = payload.get("price")
    if not name or not category or price is None:
        raise HTTPException(400, "name, category and price are required")
    if db["menu"].find_one({"name": name}):
        raise HTTPException(409, "A dish with this name already exists")
    doc = {"name":name,"category":category,"price":float(price),"description":payload.get("description","").strip(),"image":save_image(payload.get("image","")),"available":payload.get("available",True),"created_at":datetime.utcnow()}
    result = db["menu"].insert_one(doc); doc["_id"] = str(result.inserted_id)
    return {"message":"Dish added","item":doc}

@app.put("/api/menu/{item_id}")
def update_menu_item(item_id: str, payload: dict, admin=Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(400, "Invalid item ID")
    allowed = {"name","category","price","description","image","available"}
    update_data = {k:v for k,v in payload.items() if k in allowed}
    if not update_data:
        raise HTTPException(400, "No valid fields to update")
    if "price" in update_data:
        update_data["price"] = float(update_data["price"])
    if "image" in update_data:
        existing = db["menu"].find_one({"_id": oid})
        update_data["image"] = save_image(update_data["image"], existing.get("image","") if existing else "")
    update_data["updated_at"] = datetime.utcnow()
    result = db["menu"].update_one({"_id":oid},{"$set":update_data})
    if result.matched_count == 0:
        raise HTTPException(404, "Dish not found")
    return {"message":"Dish updated"}

@app.delete("/api/menu/{item_id}")
def delete_menu_item(item_id: str, admin=Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(400, "Invalid item ID")
    result = db["menu"].delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Dish not found")
    return {"message":"Dish deleted"}

@app.put("/api/menu/{item_id}/toggle")
def toggle_menu_item(item_id: str, admin=Depends(require_admin)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(400, "Invalid item ID")
    item = db["menu"].find_one({"_id": oid})
    if not item:
        raise HTTPException(404, "Dish not found")
    new_status = not item.get("available", True)
    db["menu"].update_one({"_id":oid},{"$set":{"available":new_status,"updated_at":datetime.utcnow()}})
    return {"message":"Availability updated","available":new_status}


# ══════════════════════════════════════════════════
# INSIGHTS — Admin analytics
# ══════════════════════════════════════════════════

@app.get("/api/insights")
def get_insights(range: str = "lifetime", admin=Depends(require_admin)):
    """
    range: today | week | month | year | lifetime
    Returns aggregated order + revenue stats + time-series data.
    """
    range_ = range
    now = datetime.utcnow()
    range_map = {
        "today":    now.replace(hour=0, minute=0, second=0, microsecond=0),
        "week":     now - timedelta(days=7),
        "month":    now - timedelta(days=30),
        "year":     now - timedelta(days=365),
        "lifetime": None,
    }
    if range_ not in range_map:
        raise HTTPException(400, "Invalid range. Choose: today, week, month, year, lifetime")

    since = range_map[range_]
    query = {"archived": {"$ne": True}}
    if since:
        query["created_at"] = {"$gte": since}

    orders = list(orders_col.find(query))

    total_orders   = len(orders)
    delivered      = [o for o in orders if o.get("status") == "delivered"]
    cancelled      = [o for o in orders if o.get("status") == "cancelled"]
    pending        = [o for o in orders if o.get("status") == "pending"]
    active         = [o for o in orders if o.get("status") in ["confirmed","preparing","out_for_delivery"]]
    paid_orders    = [o for o in orders if o.get("payment_status") == "paid"]
    total_revenue  = sum(o.get("total", 0) for o in paid_orders)
    avg_order_val  = (total_revenue / len(paid_orders)) if paid_orders else 0
    delivery_rate  = round((len(delivered) / total_orders * 100), 1) if total_orders else 0

    # Time-series: group by day
    daily_orders  = defaultdict(int)
    daily_revenue = defaultdict(float)
    for o in orders:
        created = o.get("created_at")
        if not created:
            continue
        day_key = created.strftime("%Y-%m-%d")
        daily_orders[day_key]  += 1
        if o.get("payment_status") == "paid":
            daily_revenue[day_key] += o.get("total", 0)

    # Fill in missing days for the range
    if since:
        delta = (now - since).days + 1
        days_to_show = min(delta, 365)
    else:
        # Lifetime: use first order date to now
        if orders:
            first_date = min((o["created_at"] for o in orders if o.get("created_at")), default=now)
            days_to_show = (now - first_date).days + 1
        else:
            days_to_show = 30
    days_to_show = max(days_to_show, 1)

    timeline = []
    for i in builtins.range(days_to_show - 1, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        timeline.append({
            "date":    d,
            "orders":  daily_orders.get(d, 0),
            "revenue": round(daily_revenue.get(d, 0), 2),
        })

    return {
        "range":          range_,
        "total_orders":   total_orders,
        "total_revenue":  round(total_revenue, 2),
        "avg_order_value": round(avg_order_val, 2),
        "delivery_rate":  delivery_rate,
        "pending":        len(pending),
        "active":         len(active),
        "delivered":      len(delivered),
        "cancelled":      len(cancelled),
        "timeline":       timeline,
    }


# ══════════════════════════════════════════════════
# GALLERY — Community Moments Wall
# ══════════════════════════════════════════════════

@app.get("/api/gallery/official")
def get_official_gallery(user=Depends(get_optional_user)):
    viewer_id = user["id"] if user else ""
    posts = list(gallery_col.find({
        "isOfficial": True,
        "imageUrl": {"$exists": True, "$nin": ["", None]},
        "hidden": {"$ne": True},
    }).sort("created_at", 1))  # oldest first so upload order is preserved
    # Exclude off- like-tracker docs
    posts = [p for p in posts if not str(p["_id"]).startswith("off-")]
    return [gallery_serializer(p, viewer_id) for p in posts]


@app.get("/api/gallery")
def get_gallery(user=Depends(get_optional_user)):
    viewer_id = user["id"] if user else ""
    # Only return posts that have a valid imageUrl — filters out any broken/failed uploads
    posts = list(gallery_col.find({
        "imageUrl": {"$exists": True, "$nin": ["", None]},
        "isOfficial": {"$ne": True},   # off- like-tracker docs never appear in feed
    }).sort("created_at", -1))
    return [gallery_serializer(p, viewer_id) for p in posts]

@app.delete("/api/gallery/broken")
def delete_broken_posts(admin=Depends(require_admin)):
    """Admin only — permanently delete all posts with missing or empty imageUrl."""
    result = gallery_col.delete_many({
        "$or": [
            {"imageUrl": {"$exists": False}},
            {"imageUrl": ""},
            {"imageUrl": None},
        ]
    })
    return {"deleted": result.deleted_count, "message": f"Removed {result.deleted_count} broken posts"}

@app.post("/api/gallery")
async def create_gallery_post(
    image:   UploadFile = File(...),
    caption: str        = Form(""),
    user=Depends(get_current_user),
):
    allowed = {"image/jpeg","image/jpg","image/png","image/webp","image/gif"}
    if image.content_type not in allowed:
        raise HTTPException(400, "Only JPG, PNG, WEBP or GIF images are allowed.")
    contents = await image.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 10 MB.")
    try:
        result = cloudinary.uploader.upload(
            contents,
            folder="sheher_garden/gallery",
            transformation=[{"width":1400,"crop":"limit"},{"quality":"auto","fetch_format":"auto"}],
        )
    except Exception as e:
        raise HTTPException(500, f"Cloudinary upload failed: {str(e)}")
    doc = {"imageUrl":result["secure_url"],"cloudinaryId":result["public_id"],"caption":caption.strip()[:280],"author":user["name"] or user["email"],"authorId":user["id"],"likes":[],"reports":[],"isOfficial":False,"created_at":datetime.utcnow()}
    inserted = gallery_col.insert_one(doc); doc["_id"] = str(inserted.inserted_id)
    doc.pop("reports", None)   # remove before serializer (it pops internally but _id is already str now)
    return gallery_serializer(doc, user["id"])

# ── Official post likes (so frontend can sync like counts on load) ──
@app.get("/api/gallery/official-likes")
def get_official_likes(user=Depends(get_optional_user)):
    viewer_id = user["id"] if user else ""
    docs = list(gallery_col.find({"_id": {"$regex": "^off-"}}))
    result = {}
    for d in docs:
        likes = d.get("likes", [])
        result[d["_id"]] = {"likeCount": len(likes), "hasLiked": viewer_id in likes if viewer_id else False}
    return result

@app.post("/api/gallery/{post_id}/like")
def toggle_like(post_id: str, user=Depends(get_current_user)):
    uid = user["id"]
    # Try to parse as ObjectId (user posts); fall back to string _id (official posts)
    try:
        db_id = ObjectId(post_id)
    except Exception:
        db_id = post_id  # official posts use string IDs like "off-7"

    post = gallery_col.find_one({"_id": db_id})
    if not post:
        # First like on an official post — upsert it into DB so likes persist
        if isinstance(db_id, str) and db_id.startswith("off-"):
            gallery_col.update_one(
                {"_id": db_id},
                {"$setOnInsert": {"_id": db_id, "likes": [], "isOfficial": True}},
                upsert=True,
            )
            post = gallery_col.find_one({"_id": db_id})
        else:
            raise HTTPException(404, "Post not found.")

    if uid in post.get("likes", []):
        updated = gallery_col.find_one_and_update({"_id": db_id}, {"$pull": {"likes": uid}}, return_document=ReturnDocument.AFTER)
    else:
        updated = gallery_col.find_one_and_update({"_id": db_id}, {"$addToSet": {"likes": uid}}, return_document=ReturnDocument.AFTER)
    new_likes = updated.get("likes", [])
    return {"likeCount": len(new_likes), "hasLiked": uid in new_likes}

@app.post("/api/gallery/{post_id}/report")
def report_post(post_id: str, payload: dict, user=Depends(get_current_user)):
    try:
        oid = ObjectId(post_id)
    except Exception:
        return {"ok": False, "message": "Official posts cannot be reported."}
    post = gallery_col.find_one({"_id": oid})
    if not post:
        raise HTTPException(404, "Post not found.")
    uid = user["id"]
    if any(r.get("userId") == uid for r in post.get("reports", [])):
        return {"ok":True,"message":"Already reported"}
    reason = payload.get("reason","other")
    if reason not in {"inappropriate","spam","offensive","other"}:
        reason = "other"
    gallery_col.update_one({"_id":oid},{"$push":{"reports":{"userId":uid,"reason":reason,"at":datetime.utcnow()}}})
    return {"ok":True}

@app.delete("/api/gallery/{post_id}")
def delete_gallery_post(post_id: str, user=Depends(get_current_user)):
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(400, "Invalid post ID.")
    post = gallery_col.find_one({"_id": oid})
    if not post:
        raise HTTPException(404, "Post not found.")
    if user["role"] != "admin" and post.get("authorId") != user["id"]:
        raise HTTPException(403, "Not authorised to delete this post.")
    cid = post.get("cloudinaryId")
    if cid:
        try:
            cloudinary.uploader.destroy(cid)
        except Exception:
            pass
    gallery_col.delete_one({"_id": oid})
    return {"ok":True,"message":"Post deleted"}


# ══════════════════════════════════════════════════
# ADMIN — Gallery management
# ══════════════════════════════════════════════════

@app.get("/api/admin/gallery")
def admin_get_gallery(admin=Depends(require_admin)):
    posts  = list(gallery_col.find({}).sort("created_at", -1))
    result = []
    for p in posts:
        pid = str(p["_id"])
        if pid.startswith("off-"):
            continue
        if not p.get("imageUrl"):
            continue
        result.append({
            "_id":         pid,
            "imageUrl":    p.get("imageUrl",""),
            "caption":     p.get("caption",""),
            "author":      p.get("author",""),
            "authorId":    p.get("authorId",""),
            "likeCount":   len(p.get("likes",[])),
            "reportCount": len(p.get("reports",[])),
            "reports":     p.get("reports",[]),
            "isOfficial":  p.get("isOfficial",False),
            "hidden":      p.get("hidden", False),
            "created_at":  p["created_at"].isoformat() if p.get("created_at") else "",
        })
    result.sort(key=lambda x: x["reportCount"], reverse=True)
    return result
@app.post("/api/admin/gallery")
async def admin_create_gallery_post(
    image:   UploadFile = File(...),
    caption: str        = Form(""),
    admin=Depends(require_admin),
):
    """Admin posts an official gallery image (shown with cafe branding)."""
    allowed = {"image/jpeg","image/jpg","image/png","image/webp","image/gif"}
    if image.content_type not in allowed:
        raise HTTPException(400, "Only JPG, PNG, WEBP or GIF images are allowed.")
    contents = await image.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 10 MB.")
    try:
        result = cloudinary.uploader.upload(
            contents,
            folder="sheher_garden/gallery/official",
            transformation=[{"width":1400,"crop":"limit"},{"quality":"auto","fetch_format":"auto"}],
        )
    except Exception as e:
        raise HTTPException(500, f"Cloudinary upload failed: {str(e)}")
    doc = {
        "imageUrl":    result["secure_url"],
        "cloudinaryId": result["public_id"],
        "caption":     caption.strip()[:280],
        "author":      "शहर Garden Cafe & Kitchen",
        "authorId":    admin["id"],
        "likes":       [],
        "reports":     [],
        "isOfficial":  True,
        "created_at":  datetime.utcnow(),
    }
    inserted = gallery_col.insert_one(doc)
    doc["_id"] = str(inserted.inserted_id)
    doc.pop("reports", None)
    return gallery_serializer(doc, admin["id"])

@app.put("/api/admin/gallery/{post_id}")
async def admin_update_gallery_post(
    post_id: str,
    caption: str                  = Form(""),
    hidden:  str                  = Form("false"),
    image:   Optional[UploadFile] = File(None),
    admin=Depends(require_admin),
):
    """Admin edits an official post — caption, visibility, and optionally replaces image."""
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(400, "Invalid post ID.")
    post = gallery_col.find_one({"_id": oid})
    if not post:
        raise HTTPException(404, "Post not found.")
    if not post.get("isOfficial"):
        raise HTTPException(403, "Only official posts can be edited.")

    update: dict = {
        "caption": caption.strip()[:280],
        "hidden":  hidden.lower() == "true",
    }

    if image and image.filename:
        allowed = {"image/jpeg","image/jpg","image/png","image/webp","image/gif"}
        if image.content_type not in allowed:
            raise HTTPException(400, "Only JPG, PNG, WEBP or GIF images are allowed.")
        contents = await image.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(400, "Image must be under 10 MB.")
        old_cid = post.get("cloudinaryId")
        if old_cid:
            try: cloudinary.uploader.destroy(old_cid)
            except Exception: pass
        try:
            result = cloudinary.uploader.upload(
                contents,
                folder="sheher_garden/gallery/official",
                transformation=[{"width":1400,"crop":"limit"},{"quality":"auto","fetch_format":"auto"}],
            )
        except Exception as e:
            raise HTTPException(500, f"Cloudinary upload failed: {str(e)}")
        update["imageUrl"]     = result["secure_url"]
        update["cloudinaryId"] = result["public_id"]

    gallery_col.update_one({"_id": oid}, {"$set": update})
    return {"ok": True, "message": "Post updated"}


@app.put("/api/admin/gallery/{post_id}/ignore-report")
def ignore_report(post_id: str, admin=Depends(require_admin)):
    """Clear all reports on a post (admin reviewed and ignored them)."""
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(400, "Invalid post ID.")
    result = gallery_col.update_one({"_id": oid}, {"$set": {"reports": []}})
    if result.matched_count == 0:
        raise HTTPException(404, "Post not found.")
    return {"ok": True, "message": "Reports cleared"}


# ══════════════════════════════════════════════════
# PAYMENTS — Razorpay
# ══════════════════════════════════════════════════

@app.post("/api/payments/create-order")
def create_payment_order(payload: dict, user=Depends(get_current_user)):
    """Create a Razorpay order. Returns razorpay_order_id and key_id for frontend."""
    amount = payload.get("amount")  # in rupees
    if not amount or float(amount) <= 0:
        raise HTTPException(400, "Invalid amount")
    try:
        rp_order = razorpay_client.order.create({
            "amount":   int(float(amount) * 100),  # paise
            "currency": "INR",
            "receipt":  f"rcpt_{uuid.uuid4().hex[:12]}",
        })
    except Exception as e:
        raise HTTPException(500, f"Razorpay order creation failed: {str(e)}")
    return {
        "razorpay_order_id": rp_order["id"],
        "amount":            rp_order["amount"],
        "currency":          rp_order["currency"],
        "key_id":            RAZORPAY_KEY_ID,
    }


@app.post("/api/payments/verify")
def verify_payment_and_place_order(payload: dict, user=Depends(get_current_user)):
    """
    Verify Razorpay signature, then place the order in DB.
    Expects: razorpay_order_id, razorpay_payment_id, razorpay_signature + order payload.
    """
    rp_order_id  = payload.get("razorpay_order_id", "")
    rp_payment_id = payload.get("razorpay_payment_id", "")
    rp_signature  = payload.get("razorpay_signature", "")

    # Verify signature
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{rp_order_id}|{rp_payment_id}".encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, rp_signature):
        raise HTTPException(400, "Payment verification failed. Invalid signature.")

    # Place the order
    order_data   = payload.get("order_data", {})
    subtotal     = order_data.get("subtotal", 0)
    total        = order_data.get("total", 0)
    settings     = get_settings_doc()

    if subtotal < settings["min_order_value"]:
        raise HTTPException(400, f"Minimum order value is ₹{settings['min_order_value']}")

    doc = {
        "order_type":      order_data.get("order_type", "delivery"),
        "customer_name":   order_data.get("customer_name", ""),
        "customer_phone":  order_data.get("customer_phone", ""),
        "address":         order_data.get("address", {}),
        "items":           order_data.get("items", []),
        "subtotal":        subtotal,
        "coupon_code":     order_data.get("coupon_code"),
        "discount_amount": order_data.get("discount_amount", 0),
        "delivery_charge": order_data.get("delivery_charge", 0),
        "total":           total,
        "notes":           order_data.get("notes", ""),
        "status":          "confirmed",         # already paid — skip pending
        "payment_status":  "paid",
        "payment_method":  "online",
        "razorpay_order_id":   rp_order_id,
        "razorpay_payment_id": rp_payment_id,
        "created_at":  datetime.utcnow(),
        "updated_at":  datetime.utcnow(),
        "user_email":  user["email"],
        "user_name":   user["name"],
    }
    result = orders_col.insert_one(doc)
    return {
        "message":  "Payment verified and order placed!",
        "order_id": str(result.inserted_id),
        "status":   "confirmed",
    }
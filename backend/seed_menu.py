from pymongo import MongoClient
from dotenv import load_dotenv
import os
import certifi

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
db = client["sheher_garden_db"]
menu_col = db["menu"]

# Clear existing menu items (optional - comment out if you don't want this)
menu_col.delete_many({})

menu_items = [
    # -------------------- PIZZA --------------------
    {
        "name": "Margherita Pizza",
        "category": "Pizza",
        "price": 250,
        "description": "Classic delight topped with rich tomato sauce and a generous layer of melted mozzarella cheese.",
        "image": "",
        "available": True
    },
    {
        "name": "Peri Peri Paneer Pizza",
        "category": "Pizza",
        "price": 280,
        "description": "Spicy peri peri marinated paneer with crunchy capsicum and onions over a cheesy base.",
        "image": "",
        "available": True
    },
    {
        "name": "Peppy Paneer Pizza",
        "category": "Pizza",
        "price": 290,
        "description": "Flavorful paneer cubes tossed with onions, capsicum, and aromatic herbs.",
        "image": "",
        "available": True
    },
    {
        "name": "Corn & Cheese Pizza",
        "category": "Pizza",
        "price": 260,
        "description": "Sweet corn kernels layered with creamy mozzarella for a comforting bite.",
        "image": "",
        "available": True
    },
    {
        "name": "Farmhouse Pizza",
        "category": "Pizza",
        "price": 300,
        "description": "Loaded with fresh vegetables, olives, capsicum, onions, and tomatoes for a wholesome experience.",
        "image": "",
        "available": True
    },
    {
        "name": "Loaded Vegetable Pizza",
        "category": "Pizza",
        "price": 295,
        "description": "A colorful mix of seasonal vegetables generously topped with extra cheese.",
        "image": "",
        "available": True
    },

    # -------------------- PASTA --------------------
    {
        "name": "Peri Peri Pasta",
        "category": "Pasta",
        "price": 220,
        "description": "Creamy pasta tossed in a spicy peri peri sauce with herbs and veggies.",
        "image": "",
        "available": True
    },
    {
        "name": "Red Sauce Pasta",
        "category": "Pasta",
        "price": 210,
        "description": "Classic Italian style pasta cooked in tangy tomato sauce with fresh herbs.",
        "image": "",
        "available": True
    },
    {
        "name": "Pink Sauce Pasta",
        "category": "Pasta",
        "price": 230,
        "description": "A perfect blend of white and red sauce creating a rich, smooth flavor.",
        "image": "",
        "available": True
    },
    {
        "name": "White Sauce Pasta",
        "category": "Pasta",
        "price": 220,
        "description": "Creamy béchamel sauce pasta loaded with vegetables and mild seasoning.",
        "image": "",
        "available": True
    },
    {
        "name": "Paneer Tikka Pasta",
        "category": "Pasta",
        "price": 250,
        "description": "Fusion style pasta mixed with smoky paneer tikka chunks.",
        "image": "",
        "available": True
    },
    {
        "name": "Cheese Jalapeño Pasta",
        "category": "Pasta",
        "price": 240,
        "description": "Creamy cheesy pasta with a spicy kick of jalapeños.",
        "image": "",
        "available": True
    },

    # -------------------- SANDWICHES --------------------
    {
        "name": "Veg Grilled Sandwich",
        "category": "Sandwiches",
        "price": 150,
        "description": "Grilled bread layered with fresh vegetables and melted cheese.",
        "image": "",
        "available": True
    },
    {
        "name": "Schezwan Sandwich",
        "category": "Sandwiches",
        "price": 170,
        "description": "Spicy schezwan spread with crunchy vegetables and cheese.",
        "image": "",
        "available": True
    },
    {
        "name": "Chilli Garlic Sandwich",
        "category": "Sandwiches",
        "price": 180,
        "description": "Bold garlic flavor with a mild chilli punch and melted cheese.",
        "image": "",
        "available": True
    },
    {
        "name": "Paneer Tikka Sandwich",
        "category": "Sandwiches",
        "price": 200,
        "description": "Soft bread stuffed with flavorful paneer tikka filling.",
        "image": "",
        "available": True
    },

    # -------------------- MILKSHAKES --------------------
    {
        "name": "Vanilla Milkshake",
        "category": "Milkshakes",
        "price": 200,
        "description": "Smooth and creamy classic vanilla blended to perfection.",
        "image": "",
        "available": True
    },
    {
        "name": "Strawberry Milkshake",
        "category": "Milkshakes",
        "price": 220,
        "description": "Fresh strawberry flavor with rich creamy texture.",
        "image": "",
        "available": True
    },
    {
        "name": "Butterscotch Milkshake",
        "category": "Milkshakes",
        "price": 240,
        "description": "Sweet butterscotch blended with ice cream for a delightful treat.",
        "image": "",
        "available": True
    },
    {
        "name": "Chocolate Milkshake",
        "category": "Milkshakes",
        "price": 270,
        "description": "Thick and indulgent chocolate shake topped with chocolate drizzle.",
        "image": "",
        "available": True
    },

    # -------------------- CHINESE --------------------
    {
        "name": "Veg Chowmein",
        "category": "Chinese",
        "price": 250,
        "description": "Stir fried noodles tossed with fresh vegetables and sauces.",
        "image": "",
        "available": True
    },
    {
        "name": "Schezwan Noodles",
        "category": "Chinese",
        "price": 300,
        "description": "Spicy schezwan flavored noodles with crunchy veggies.",
        "image": "",
        "available": True
    },
    {
        "name": "Chilli Garlic Noodles",
        "category": "Chinese",
        "price": 280,
        "description": "Noodles tossed in a bold chilli garlic sauce.",
        "image": "",
        "available": True
    },
    {
        "name": "Veg Spring Roll",
        "category": "Chinese",
        "price": 260,
        "description": "Crispy rolls stuffed with seasoned vegetables.",
        "image": "",
        "available": True
    },
    {
        "name": "Soya Chilli",
        "category": "Chinese",
        "price": 320,
        "description": "Crispy soya chunks cooked in spicy chilli sauce.",
        "image": "",
        "available": True
    },
    {
        "name": "Veg Manchurian",
        "category": "Chinese",
        "price": 350,
        "description": "Fried vegetable balls served in a flavorful Manchurian gravy.",
        "image": "",
        "available": True
    },
]

# Insert all items
menu_col.insert_many(menu_items)
print(f"✅ Successfully added {len(menu_items)} menu items to MongoDB!")

# Print summary by category
categories = {}
for item in menu_items:
    cat = item["category"]
    categories[cat] = categories.get(cat, 0) + 1

print("\n📋 Summary:")
for cat, count in categories.items():
    print(f"   {cat}: {count} items")
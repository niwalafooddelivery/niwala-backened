# Niwala Backend

Node.js + Express + MongoDB + Socket.IO backend for Niwala Food Delivery app.

## Setup

### 1. Install Node.js
Download from https://nodejs.org (LTS version)

### 2. Install MongoDB (choose ONE option)

**Option A: Local MongoDB (recommended for testing)**
- Download: https://www.mongodb.com/try/download/community
- Install and run as service
- The default URI in `.env` will work: `mongodb://localhost:27017/niwala`

**Option B: MongoDB Atlas (free cloud)**
- Sign up at https://www.mongodb.com/cloud/atlas (free)
- Create free M0 cluster
- Get connection string and paste in `.env` as `MONGODB_URI`

### 3. Install dependencies
```bash
cd niwala-backend
npm install
```

### 4. Configure `.env`
The `.env` file is already created with defaults. Edit if needed.

### 5. Run server
```bash
npm start
```

Server runs at: **http://localhost:5000**

## Default Admin Login
- Email: `admin@niwala.com`
- Password: `admin123`

(Auto-created on first run)

## API Endpoints

### Auth (Public)
- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Get reset token
- `POST /api/auth/reset-password` - Reset password
- `GET  /api/auth/me` - Current user (requires token)

### Admin (Token + admin role required)
- `GET  /api/admin/dashboard` - Stats
- `GET  /api/admin/restaurants?status=pending` - List restaurants
- `GET  /api/admin/riders?status=pending` - List riders
- `PUT  /api/admin/approve/:userId` - Approve/reject (body: `{action: 'approve'|'reject'}`)
- `DELETE /api/admin/user/:userId` - Delete user
- `GET  /api/admin/orders` - All orders

### Customer
- `GET  /api/customer/restaurants?lat=&lng=&radius=` - Nearby restaurants
- `GET  /api/customer/restaurant/:id/menu` - Restaurant menu
- `POST /api/customer/order` - Place order
- `GET  /api/customer/orders` - My orders
- `GET  /api/customer/order/:id` - Order details (with rider live location)
- `GET  /api/customer/order/:id/messages` - Chat history
- `POST /api/customer/order/:id/messages` - Send message

### Rider
- `GET  /api/rider/dashboard` - Stats
- `PUT  /api/rider/online` - Toggle online
- `GET  /api/rider/orders/incoming` - New orders assigned
- `GET  /api/rider/orders/active` - Currently active order
- `GET  /api/rider/orders/history` - Past orders
- `PUT  /api/rider/order/:id/status` - Update status (pickup/deliver)
- `PUT  /api/rider/location` - Update GPS location
- `GET  /api/rider/order/:id/messages` - Chat
- `POST /api/rider/order/:id/messages` - Send message

### Restaurant
- `GET  /api/restaurant/dashboard` - Stats
- `GET  /api/restaurant/food` - My menu
- `POST /api/restaurant/food` - Add food item
- `PUT  /api/restaurant/food/:id` - Update
- `DELETE /api/restaurant/food/:id` - Delete
- `GET  /api/restaurant/orders` - Restaurant orders
- `PUT  /api/restaurant/orders/:id` - Accept/prepare/ready

### Upload
- `POST /api/upload/image` - Upload image (multipart/form-data, field: `image`)

## Socket.IO Events

**Client → Server:**
- `join_order` (orderId) - Join order chat/tracking room
- `join_role` ({role, userId}) - Join role notifications
- `send_message` ({orderId, senderId, senderRole, message})
- `rider_location` ({orderId, riderId, latitude, longitude})

**Server → Client:**
- `new_message` - New chat message
- `rider_location_update` - Rider GPS update
- `order_status_update` - Status changed
- `new_order` - New order for restaurant
- `new_order_assigned` - New order for rider

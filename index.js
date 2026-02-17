require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      /\.vercel\.app$/,
      /\.web\.app$/,
      /\.firebaseapp\.com$/,
    ],
    credentials: true,
  })
);
app.use(express.json());

// MongoDB Connection (lazy)
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.l2cobj0.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, servicesCollection, usersCollection, bookingsCollection;
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  await client.connect();
  db = client.db("care_xyz");
  servicesCollection = db.collection("services");
  usersCollection = db.collection("users");
  bookingsCollection = db.collection("bookings");
  isConnected = true;
  console.log("Connected to MongoDB!");

  // Seed services (once)
  const serviceCount = await servicesCollection.estimatedDocumentCount();
  if (serviceCount === 0) {
    await servicesCollection.insertMany([
      {
        title: "Baby Care",
        description:
          "Professional and loving babysitting services for your little ones. Our trained caregivers ensure your children are safe, happy, and engaged with age-appropriate activities throughout the day.",
        image: "https://i.ibb.co/placeholder-baby-care.jpg",
        chargePerHour: 150,
        chargePerDay: 1200,
        features: [
          "Certified child caregivers",
          "Age-appropriate activities",
          "Meal preparation for kids",
          "Safety-first environment",
          "Daily progress reports",
        ],
        category: "baby-care",
      },
      {
        title: "Elderly Service",
        description:
          "Compassionate elderly care services to support your senior family members. We provide dedicated caregivers who assist with daily activities, medication reminders, and companionship to ensure comfort and dignity.",
        image: "https://i.ibb.co/placeholder-elderly-care.jpg",
        chargePerHour: 200,
        chargePerDay: 1500,
        features: [
          "Experienced elderly caregivers",
          "Medication management",
          "Mobility assistance",
          "Companionship and emotional support",
          "Health monitoring",
        ],
        category: "elderly",
      },
      {
        title: "Sick People Service",
        description:
          "Specialized home care for sick or recovering individuals. Our skilled caregivers provide medical assistance, post-surgery care, and rehabilitation support in the comfort of your home.",
        image: "https://i.ibb.co/placeholder-sick-care.jpg",
        chargePerHour: 250,
        chargePerDay: 1800,
        features: [
          "Trained medical caregivers",
          "Post-surgery recovery care",
          "Medication administration",
          "Vital signs monitoring",
          "Rehabilitation support",
        ],
        category: "sick-people",
      },
    ]);
    console.log("Seeded initial services data.");
  }
}

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// Services API
// ==========================================

// GET /services - get all services (optionally filter by email)
app.get("/services", async (req, res) => {
  await connectDB();
  const email = req.query.email;
  const query = email ? { createdBy: email } : {};
  const result = await servicesCollection.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// GET /services/:id - get single service
app.get("/services/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await servicesCollection.findOne(query);
  if (!result) {
    return res.status(404).send({ message: "Service not found" });
  }
  res.send(result);
});

// POST /services - create a new service
app.post("/services", async (req, res) => {
  await connectDB();
  const service = req.body;
  const result = await servicesCollection.insertOne({
    ...service,
    createdAt: new Date(),
  });
  res.send(result);
});

// PUT /services/:id - update a service
app.put("/services/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const updatedData = req.body;
  delete updatedData._id;
  const result = await servicesCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );
  res.send(result);
});

// DELETE /services/:id - delete a service
app.delete("/services/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await servicesCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ==========================================
// Users API
// ==========================================

// POST /users - save new user
app.post("/users", async (req, res) => {
  await connectDB();
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await usersCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "User already exists", insertedId: null });
  }
  const result = await usersCollection.insertOne({
    ...user,
    role: "user",
    createdAt: new Date(),
  });
  res.send(result);
});

// GET /users/:email - get user by email
app.get("/users/:email", async (req, res) => {
  await connectDB();
  const email = req.params.email;
  const result = await usersCollection.findOne({ email });
  if (!result) {
    return res.status(404).send({ message: "User not found" });
  }
  res.send(result);
});

// PUT /users/:email - update user profile
app.put("/users/:email", async (req, res) => {
  await connectDB();
  const email = req.params.email;
  const updatedData = req.body;
  const result = await usersCollection.updateOne(
    { email },
    { $set: updatedData },
    { upsert: true }
  );
  res.send(result);
});

// ==========================================
// Bookings API
// ==========================================

// POST /bookings - create a new booking
app.post("/bookings", async (req, res) => {
  await connectDB();
  const booking = req.body;
  const result = await bookingsCollection.insertOne({
    ...booking,
    status: "Pending",
    createdAt: new Date(),
  });

  // Send email invoice if EMAIL_USER is configured
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      await transporter.sendMail({
        from: `"Care.xyz" <${process.env.EMAIL_USER}>`,
        to: booking.userEmail,
        subject: `Booking Confirmation - ${booking.serviceName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Care.xyz - Booking Invoice</h2>
            <hr/>
            <p>Dear <strong>${booking.userName}</strong>,</p>
            <p>Your booking has been placed successfully!</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #f3f4f6;">
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Service</strong></td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.serviceName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Duration</strong></td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.durationValue} ${booking.durationType}</td>
              </tr>
              <tr style="background: #f3f4f6;">
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Location</strong></td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.area}, ${booking.city}, ${booking.district}, ${booking.division}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Address</strong></td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${booking.address}</td>
              </tr>
              <tr style="background: #2563eb; color: white;">
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Total Cost</strong></td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>৳${booking.totalCost}</strong></td>
              </tr>
            </table>
            <p>Status: <strong>Pending</strong></p>
            <p style="color: #6b7280; font-size: 14px;">Thank you for choosing Care.xyz!</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send invoice email:", emailError.message);
    }
  }

  res.send(result);
});

// GET /bookings - get bookings by user email
app.get("/bookings", async (req, res) => {
  await connectDB();
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email query parameter is required" });
  }
  const result = await bookingsCollection
    .find({ userEmail: email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// GET /bookings/:id - get single booking
app.get("/bookings/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  if (!result) {
    return res.status(404).send({ message: "Booking not found" });
  }
  res.send(result);
});

// PATCH /bookings/:id - update booking status
app.patch("/bookings/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const { status } = req.body;
  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );
  res.send(result);
});

// DELETE /bookings/:id - delete a booking
app.delete("/bookings/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ==========================================
// Admin APIs
// ==========================================

// Middleware: verify admin role
const verifyAdmin = async (req, res, next) => {
  await connectDB();
  const email = req.query.email || req.headers["x-user-email"];
  if (!email) {
    return res.status(401).send({ message: "Unauthorized: no email provided" });
  }
  const user = await usersCollection.findOne({ email });
  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: admin access required" });
  }
  next();
};

// GET /admin/check/:email - check if user is admin
app.get("/admin/check/:email", async (req, res) => {
  await connectDB();
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send({ isAdmin: user?.role === "admin" });
});

// GET /admin/stats - dashboard overview stats
app.get("/admin/stats", verifyAdmin, async (req, res) => {
  const totalBookings = await bookingsCollection.estimatedDocumentCount();
  const totalUsers = await usersCollection.estimatedDocumentCount();
  const totalServices = await servicesCollection.estimatedDocumentCount();

  const revenueResult = await bookingsCollection
    .aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $group: { _id: null, total: { $sum: "$totalCost" } } },
    ])
    .toArray();
  const totalRevenue = revenueResult[0]?.total || 0;

  const statusCounts = await bookingsCollection
    .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    .toArray();

  res.send({
    totalBookings,
    totalUsers,
    totalServices,
    totalRevenue,
    statusCounts,
  });
});

// GET /admin/bookings - get all bookings (with optional status filter)
app.get("/admin/bookings", verifyAdmin, async (req, res) => {
  const status = req.query.status;
  const query = status ? { status } : {};
  const result = await bookingsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// GET /admin/users - get all users
app.get("/admin/users", verifyAdmin, async (req, res) => {
  const result = await usersCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// PATCH /admin/users/:email/role - update user role
app.patch("/admin/users/:email/role", verifyAdmin, async (req, res) => {
  const email = req.params.email;
  const { role } = req.body;
  if (!["user", "admin"].includes(role)) {
    return res.status(400).send({ message: "Invalid role" });
  }
  const result = await usersCollection.updateOne(
    { email },
    { $set: { role } }
  );
  res.send(result);
});

// ==========================================
// Root
// ==========================================
app.get("/", (req, res) => {
  res.send("Care.xyz server is running");
});

// Only listen when running locally (not on Vercel)
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;

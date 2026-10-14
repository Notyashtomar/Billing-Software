import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
await mongoose.connect(process.env.MONGO_URI);
const main = mongoose.connection.db.collection('mainDetails');
const withH = await main.countDocuments({ TypeofHandling: { $nin: ['', null] } });
const withCat = await main.countDocuments({ Cate_of_Flight: { $nin: ['', null] } });
console.log({ total: await main.countDocuments(), withHandling: withH, withCat });
await mongoose.disconnect();

require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // already restored?
  const exists = await db.collection("fhr_collection").findOne({
    stationCode: "IXC",
    $or: [
      { SerialNo: 11658 },
      { "remarks.FlightNo": { $regex: "IX1236" } },
      { "mainDetails.STADate": "28/07/2026", "mainDetails.Route": "IDR-DEL" },
    ],
  });
  console.log("exists", exists ? { SerialNo: exists.SerialNo, flight: exists.remarks?.FlightNo } : null);

  const sched = await db.collection("advance_schedule_setup").findOne({
    stationCode: "IXC",
    serialNo: "420232",
  });
  console.log("schedule", JSON.stringify(sched?.data, null, 2));

  // template: recent IXC FHR doc structure
  const tmpl = await db.collection("fhr_collection").findOne(
    { stationCode: "IXC" },
    { sort: { updatedAt: -1 } }
  );
  console.log("tmpl top keys", Object.keys(tmpl || {}));
  console.log("tmpl mainDetails keys", Object.keys(tmpl?.mainDetails || {}));
  console.log("tmpl remarks keys", Object.keys(tmpl?.remarks || {}));
  console.log("tmpl status", tmpl?.status, "equip len", (tmpl?.equipmentDetails || []).length);

  // sample instance state
  const fis = await db.collection("flight_instance_state").findOne({ stationCode: "IXC" });
  console.log("fis sample", JSON.stringify(fis, null, 2));

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });

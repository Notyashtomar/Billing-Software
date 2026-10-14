require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const withRemarks = await db.collection("fhr_collection").findOne({
    stationCode: "IXC",
    "remarks.FlightNo": { $exists: true, $ne: "" },
  });
  if (withRemarks) {
    console.log(JSON.stringify({
      SerialNo: withRemarks.SerialNo,
      status: withRemarks.status,
      staDates: withRemarks.staDates,
      mainDetails: withRemarks.mainDetails,
      remarks: withRemarks.remarks,
      equipmentDetails: (withRemarks.equipmentDetails || []).slice(0, 2),
      equipCount: (withRemarks.equipmentDetails || []).length,
    }, null, 2));
  } else {
    console.log("no remarks FlightNo");
    const any = await db.collection("fhr_collection").findOne({ stationCode: "IXC", status: "DRAFT" });
    console.log(JSON.stringify({
      SerialNo: any.SerialNo,
      mainDetails: any.mainDetails,
      remarks: any.remarks,
      staDates: any.staDates,
      workbookExtras: any.workbookExtras,
    }, null, 2));
  }

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });

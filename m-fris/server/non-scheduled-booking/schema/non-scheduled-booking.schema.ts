import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';
import {
  BOOKING_CHANNELS,
  BOOKING_STATUSES,
  FLIGHT_TYPE_FIXED,
  NS_NON_SCHEDULED_BOOKING_COLLECTION,
  SERVICE_TYPE_FIXED,
  type BookingChannel,
  type BookingStatus,
} from '../utils/booking-no.util';

export type NonScheduledBookingDocument = NonScheduledBooking & Document;

@Schema({ _id: false })
export class NonScheduledPassenger {
  @Prop({ required: true })
  name: string;

  @Prop({ default: () => new Date().toISOString() })
  addedAt: string;
}
const NonScheduledPassengerSchema =
  SchemaFactory.createForClass(NonScheduledPassenger);

@Schema({ timestamps: true, collection: NS_NON_SCHEDULED_BOOKING_COLLECTION })
export class NonScheduledBooking {
  /**
   * Display business id —
   * `{station}/BKG/{serial}/{DD-MM-YYYY}/{airlineCode}/{flightNo}`
   */
  @Prop({ required: true })
  bookingNo: string;

  /** URL-safe form of bookingNo (`/` → `_`). Unique per station when present. */
  @Prop({ default: '' })
  bookingKey: string;

  /** Per-flight serial used in BKG/CLN document numbers. */
  @Prop({ default: 0 })
  documentSerial: number;

  /** mainDetails SerialNo once flight is promoted (100001+). */
  @Prop({ default: 0 })
  flightSerialNo: number;

  @Prop({ required: true, enum: BOOKING_CHANNELS, type: String })
  channel: BookingChannel;

  @Prop({ default: '' })
  operator: string;

  @Prop({ default: '' })
  mailReceivedFrom: string;

  @Prop({ default: '' })
  mailReceivedBy: string;

  @Prop({ default: '' })
  mailSubject: string;

  @Prop({ default: '' })
  bookingDate: string;

  @Prop({ default: '' })
  airlineBillTo: string;

  /** Parent / operating company name shown inside FHR box. */
  @Prop({ default: '' })
  companyName: string;

  @Prop({ default: '' })
  airlineCode: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ default: '' })
  registrationNo: string;

  @Prop({ default: '' })
  routing: string;

  @Prop({ default: '' })
  staDate: string;

  @Prop({ default: '' })
  staTime: string;

  @Prop({ default: '' })
  stdDate: string;

  @Prop({ default: '' })
  stdTime: string;

  @Prop({ default: '' })
  aircraftType: string;

  @Prop({ default: 'NB' })
  aircraftBody: string;

  @Prop({ default: '0' })
  mtow: string;

  @Prop({ default: '' })
  terminalCode: string;

  @Prop({ default: '' })
  opsType: string;

  @Prop({ default: '' })
  categoryOfFlight: string;

  @Prop({ default: FLIGHT_TYPE_FIXED })
  flightType: string;

  @Prop({ default: SERVICE_TYPE_FIXED })
  serviceType: string;

  @Prop({ default: 'no' })
  advance: string;

  @Prop({ default: '0' })
  amount: string;

  /** Filename only until upload storage is wired. */
  @Prop({ default: '' })
  attachmentName: string;

  @Prop({
    required: true,
    enum: BOOKING_STATUSES,
    default: 'booking_created',
    type: String,
  })
  status: BookingStatus;

  /**
   * `{station}/CLN/{serial}/{DD-MM-YYYY}/{airlineCode}/{flightNo}`
   * Filled when challan is saved.
   */
  @Prop({ default: '' })
  challanNo: string;

  @Prop({ default: '' })
  challanDate: string;

  @Prop({ default: '' })
  bayNo: string;

  @Prop({ default: '' })
  noOfFerryIssued: string;

  @Prop({ default: '' })
  noOfPax: string;

  @Prop({ default: '' })
  ghRepresentative: string;

  @Prop({ default: '' })
  airlineRepresentative: string;

  @Prop({ default: '' })
  remarks: string;

  @Prop({ type: [NonScheduledPassengerSchema], default: [] })
  passengers: NonScheduledPassenger[];

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   */
  stationCode: string;
}

export const NonScheduledBookingSchema =
  SchemaFactory.createForClass(NonScheduledBooking);

NonScheduledBookingSchema.plugin(stationAwarePlugin, { required: false });

NonScheduledBookingSchema.index(
  { stationCode: 1, bookingNo: 1 },
  { unique: true },
);
NonScheduledBookingSchema.index(
  { stationCode: 1, bookingKey: 1 },
  { unique: true, sparse: true },
);
NonScheduledBookingSchema.index(
  { stationCode: 1, challanNo: 1 },
  { sparse: true },
);
NonScheduledBookingSchema.index({ stationCode: 1, status: 1, createdAt: -1 });
NonScheduledBookingSchema.index({
  stationCode: 1,
  channel: 1,
  bookingDate: 1,
});
NonScheduledBookingSchema.index({
  stationCode: 1,
  flightSerialNo: 1,
});
NonScheduledBookingSchema.index({
  stationCode: 1,
  challanDate: 1,
});

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISupportMessage {
  sender: 'customer' | 'agent' | 'system';
  senderName: string;
  text: string;
  timestamp: Date;
}

export interface ISupportTicket extends Document {
  ticketId: string;
  customerPhone: string;
  customerName?: string;
  status: 'open' | 'pending_agent' | 'pending_customer' | 'resolved';
  meterNo?: string;
  disco?: string;
  lastOrderRef?: string;
  messages: ISupportMessage[];
  assignedTo?: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    sender: {
      type: String,
      enum: ['customer', 'agent', 'system'],
      required: true,
    },
    senderName: {
      type: String,
      default: 'Customer',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerPhone: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'pending_agent', 'pending_customer', 'resolved'],
      default: 'open',
      index: true,
    },
    meterNo: {
      type: String,
      trim: true,
    },
    disco: {
      type: String,
      trim: true,
    },
    lastOrderRef: {
      type: String,
      trim: true,
    },
    messages: [SupportMessageSchema],
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performant desk searching
SupportTicketSchema.index({ status: 1, lastMessageAt: -1 });
SupportTicketSchema.index({ customerPhone: 1, status: 1 });

export const SupportTicket: Model<ISupportTicket> = mongoose.model<ISupportTicket>(
  'SupportTicket',
  SupportTicketSchema
);

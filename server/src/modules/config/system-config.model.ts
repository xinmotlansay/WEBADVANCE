import { Schema, model, type Types } from 'mongoose';

export interface SystemConfigDoc {
  _id: string;
  value: unknown;
  description?: string;
  updatedBy: Types.ObjectId;
}

const systemConfigSchema = new Schema<SystemConfigDoc>(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  },
  { timestamps: true },
);

export const SystemConfigModel = model<SystemConfigDoc>('system_configs', systemConfigSchema);

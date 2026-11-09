import { z } from 'zod';
import {
  discountFromPercent,
  EVENT_TYPES,
  isFiveMinuteStep,
  LEAD_SOURCES,
  normalizeTime,
  normalizeTimestamp,
  PIPELINES,
  STAGE_OUTCOMES,
  VISIT_STATUSES,
} from './domain/crm';

export const OFFERING_TYPES = [
  'event_place_with_rooms',
  'event_place_only',
  'room_only',
  'amenity',
] as const;

export const STATUS_CATEGORIES = ['new', 'booked', 'closed'] as const;

const statusKey = z.string().trim().min(1, 'Status is required').max(80);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalInt = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a whole number' });
      return z.NEVER;
    }
    return n;
  });

const optionalMoney = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a positive amount' });
      return z.NEVER;
    }
    return n;
  });

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const quantityField = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return 1;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Quantity must be at least 1' });
      return z.NEVER;
    }
    return n;
  });

const moneyField = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be zero or more' });
      return z.NEVER;
    }
    return n;
  });

const optionalTimestamp = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const normalized = normalizeTimestamp(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a valid date and time' });
      return z.NEVER;
    }
    return normalized;
  });

const optionalTime = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    const normalized = normalizeTime(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use a valid time in 5-minute steps (e.g. 14:00, 14:05)',
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use YYYY-MM-DD' });
      return z.NEVER;
    }
    return value;
  });

const optionalPercent = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be between 0 and 100' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const optionalEventType = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!(EVENT_TYPES as readonly string[]).includes(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose Corporate, Wedding, or Socials' });
      return z.NEVER;
    }
    return value as (typeof EVENT_TYPES)[number];
  });

export const offeringSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  type: z.enum(OFFERING_TYPES),
  description: optionalText(5000),
  capacity: optionalInt,
  price: optionalMoney,
  price_unit: optionalText(40),
  quantity: quantityField,
  is_active: z.boolean().default(true),
});

const requestBase = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(160),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: optionalText(40),
  offering_id: optionalInt,
  start_date: dateString,
  end_date: dateString,
  guests: optionalInt,
  event_type: optionalText(120),
  message: optionalText(5000),
  amenity_ids: z.array(z.coerce.number().int().positive()).max(50).default([]),
});

const datesInOrder = (v: { start_date: string; end_date: string }) => v.end_date >= v.start_date;
const datesMessage = { message: 'End date must be on or after start date', path: ['end_date'] };

export const publicRequestSchema = requestBase.refine(datesInOrder, datesMessage);

/** Website form → pipeline inquiry. Accepts booking-style field names. */
export const publicInquirySchema = z
  .object({
    full_name: z.string().trim().min(1, 'Name is required').max(160).optional(),
    customer_name: z.string().trim().min(1, 'Name is required').max(160).optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    phone: optionalText(40),
    offering_id: z.coerce.number().int().positive('Choose a package'),
    start_date: dateString,
    end_date: dateString,
    guests: optionalInt,
    event_type: optionalEventType,
    message: optionalText(5000),
    amenity_ids: z.array(z.coerce.number().int().positive()).max(50).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.full_name && !value.customer_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name is required', path: ['full_name'] });
    }
  })
  .refine(datesInOrder, datesMessage)
  .transform((value) => ({
    customer_name: (value.customer_name || value.full_name) as string,
    email: value.email,
    phone: value.phone,
    offering_id: value.offering_id,
    start_date: value.start_date,
    end_date: value.end_date,
    guests: value.guests,
    event_type: value.event_type,
    message: value.message,
    amenity_ids: value.amenity_ids,
  }));

export const adminRequestSchema = requestBase
  .extend({
    status: statusKey.optional(),
    admin_notes: optionalText(5000),
    source: z.string().trim().max(40).default('admin'),
  })
  .refine(datesInOrder, datesMessage);

export const statusSchema = z.object({
  status: statusKey,
  admin_notes: optionalText(5000).optional(),
});

export const agentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((value, ctx) => {
      if (!value) return null;
      const parsed = z.string().email('Enter a valid email').safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email' });
        return z.NEVER;
      }
      return parsed.data.toLowerCase();
    }),
  phone: optionalText(40),
});

export const adminUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Use at least 8 characters').max(200),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #4f46e5').transform((v) => v.toLowerCase());

export const statusInputSchema = z.object({
  label: z.string().trim().min(1, 'Name is required').max(60),
  bg: hexColor,
  text_color: hexColor,
  category: z.enum(STATUS_CATEGORIES),
  is_default: z.boolean().default(false),
});

export const statusOrderSchema = z.object({
  keys: z.array(statusKey).min(1).max(100),
});

export const inquirySchema = z
  .object({
    pipeline: z.enum(PIPELINES),
    stage_id: z.coerce.number().int().positive().optional(),
    customer_name: z.string().trim().min(1, 'Name is required').max(160),
    phone: optionalText(40),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    lead_source: z.enum(LEAD_SOURCES),
    lead_source_detail: optionalText(200),
    offering_id: optionalInt,
    event_type: optionalEventType,
    guests: optionalInt,
    start_at: optionalTimestamp,
    end_at: optionalTimestamp,
    cocktail_time: optionalTime,
    accommodation_date: optionalDate,
    special_requests: optionalText(5000),
    additional_services: optionalText(5000),
    custom_arrangements: optionalText(5000),
    internal_notes: optionalText(5000),
    package_price: moneyField,
    additional_charges: moneyField,
    discounts: moneyField,
    discount_percent: optionalPercent,
    other_fees: moneyField,
    final_agreed_price: optionalMoney,
    deposit_amount: optionalMoney,
    deposit_note: optionalText(2000),
    agent_ids: z.array(z.coerce.number().int().positive()).max(20).optional().transform((ids) => ids ?? []),
  })
  .superRefine((value, ctx) => {
    if (value.pipeline === 'event_venue' && value.start_at && !isFiveMinuteStep(value.start_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Event start time must be in 5-minute steps',
        path: ['start_at'],
      });
    }
  })
  .transform((value) => {
    const discount_percent = value.discount_percent;
    const discounts =
      discount_percent != null
        ? discountFromPercent(
            value.package_price,
            value.additional_charges,
            value.other_fees,
            discount_percent,
          )
        : value.discounts;
    return {
      ...value,
      // Soft-retired: keep columns but stop writing new values from the API.
      additional_services: null as string | null,
      custom_arrangements: null as string | null,
      discount_percent,
      discounts,
    };
  });

export const inquiryUpdateSchema = inquirySchema.and(
  z.object({
    updated_at: z.string().trim().min(1),
  }),
);

export const stageMoveSchema = z.object({
  stage_id: z.coerce.number().int().positive(),
  updated_at: z.string().trim().min(1),
});

export const stageInputSchema = z.object({
  pipeline: z.enum(PIPELINES),
  label: z.string().trim().min(1, 'Name is required').max(60),
  bg: hexColor,
  text_color: hexColor,
  outcome: z.enum(STAGE_OUTCOMES).default('open'),
});

export const stageOrderSchema = z.object({
  pipeline: z.enum(PIPELINES),
  ids: z.array(z.coerce.number().int().positive()).min(1).max(50),
});

export const visitSchema = z.object({
  scheduled_at: z.string().trim().min(1).transform((value, ctx) => {
    const normalized = normalizeTimestamp(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a valid date and time' });
      return z.NEVER;
    }
    return normalized;
  }),
  status: z.enum(VISIT_STATUSES),
  notes: optionalText(5000),
  outcome: optionalText(5000),
});

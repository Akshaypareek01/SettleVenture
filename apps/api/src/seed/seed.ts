import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import {
  Partner,
  VentureType,
  Venture,
  PartnerVenture,
  Transaction,
  Category,
} from '../models/index.js';

const VENTURE_TYPES = [
  { slug: 'truck', label: 'Truck', icon: 'truck', colorHex: '#22c55e', sortOrder: 1 },
  { slug: 'car', label: 'Car', icon: 'car', colorHex: '#60a5fa', sortOrder: 2 },
  { slug: 'plot', label: 'Plot', icon: 'map', colorHex: '#a78bfa', sortOrder: 3 },
  { slug: 'jamin', label: 'Jamin', icon: 'landmark', colorHex: '#fb923c', sortOrder: 4 },
  { slug: 'company', label: 'Company', icon: 'building', colorHex: '#f472b6', sortOrder: 5 },
];

const GLOBAL_CATEGORIES: { name: string; direction: 'IN' | 'OUT'; systemKey?: string }[] = [
  { name: 'Partner investment', direction: 'IN', systemKey: 'CONTRIBUTION' },
  { name: 'Earning', direction: 'IN', systemKey: 'EARNING' },
  { name: 'Other deposit', direction: 'IN' },
  { name: 'Diesel', direction: 'OUT' },
  { name: 'Driver fee', direction: 'OUT' },
  { name: 'Maintenance', direction: 'OUT' },
  { name: 'EMI', direction: 'OUT', systemKey: 'EMI' },
  { name: 'Vendor payment', direction: 'OUT' },
  { name: 'Bank charges', direction: 'OUT' },
  { name: 'Other', direction: 'OUT' },
];

/**
 * Seeds the database with demo data for development.
 */
async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: this wipes collections and NODE_ENV is production');
  }
  await connectDb();

  await Promise.all([
    Partner.deleteMany({}),
    VentureType.deleteMany({}),
    Venture.deleteMany({}),
    PartnerVenture.deleteMany({}),
    Transaction.deleteMany({}),
    Category.deleteMany({}),
  ]);

  for (const vt of VENTURE_TYPES) {
    await VentureType.create(vt);
  }

  for (const cat of GLOBAL_CATEGORIES) {
    await Category.create({ ...cat, ventureId: null, isActive: true });
  }

  const truckType = await VentureType.findOne({ slug: 'truck' });
  const carType = await VentureType.findOne({ slug: 'car' });

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const partnerHash = await bcrypt.hash('Partner123!', 12);

  const admin = await Partner.create({
    name: 'Admin',
    email: 'admin@apexledger.local',
    passwordHash,
    role: 'admin',
  });

  const akshay = await Partner.create({
    name: 'Akshay',
    email: 'partner1@apexledger.local',
    passwordHash: partnerHash,
    role: 'partner',
  });

  const rahul = await Partner.create({
    name: 'Rahul',
    email: 'partner2@apexledger.local',
    passwordHash: partnerHash,
    role: 'partner',
  });

  const priya = await Partner.create({
    name: 'Priya',
    email: 'partner3@apexledger.local',
    passwordHash: partnerHash,
    role: 'partner',
  });

  const truck1 = await Venture.create({
    name: 'Truck 1',
    ventureTypeId: truckType!._id,
    description: 'First truck investment project',
    bankAccounts: [
      { label: 'HDFC Ops', bankName: 'HDFC', accountHint: '****1234', isActive: true, createdAt: new Date() },
      { label: 'SBI Pool', bankName: 'SBI', accountHint: '****5678', isActive: true, createdAt: new Date() },
    ],
  });

  const car1 = await Venture.create({
    name: 'Car 1',
    ventureTypeId: carType!._id,
    description: 'Car investment project',
    bankAccounts: [
      { label: 'Axis Project', bankName: 'Axis', accountHint: '****9012', isActive: true, createdAt: new Date() },
    ],
  });

  const assignments = [
    { partnerId: akshay._id, ventureId: truck1._id },
    { partnerId: rahul._id, ventureId: truck1._id },
    { partnerId: priya._id, ventureId: truck1._id },
    { partnerId: akshay._id, ventureId: car1._id },
    { partnerId: priya._id, ventureId: car1._id },
  ];

  for (const a of assignments) {
    await PartnerVenture.create({ ...a, assignedById: admin._id });
  }

  // Demo EMI on Akshay → Truck 1
  await PartnerVenture.findOneAndUpdate(
    { partnerId: akshay._id, ventureId: truck1._id },
    {
      isEmiActive: true,
      loanAmount: mongoose.Types.Decimal128.fromString('500000'),
      monthlyEmi: mongoose.Types.Decimal128.fromString('25000'),
      emiStartDate: new Date('2026-01-01T00:00:00.000Z'),
      tenureMonths: 24,
    }
  );

  const truckHdfc = truck1.bankAccounts[0];
  const carAxis = car1.bankAccounts[0];
  const contribCat = await Category.findOne({ systemKey: 'CONTRIBUTION' });
  const earningCat = await Category.findOne({ systemKey: 'EARNING' });
  const emiCat = await Category.findOne({ systemKey: 'EMI' });

  const sampleTxns = [
    {
      partnerId: akshay._id,
      ventureId: truck1._id,
      amount: '150000',
      paidFrom: 'HDFC Savings',
      remark: 'Initial truck investment',
      bankAccountId: truckHdfc._id,
      bankAccountLabel: truckHdfc.label,
    },
    {
      partnerId: rahul._id,
      ventureId: truck1._id,
      amount: '100000',
      paidFrom: 'ICICI Current',
      remark: 'Truck body payment share',
      bankAccountId: truckHdfc._id,
      bankAccountLabel: truckHdfc.label,
    },
    {
      partnerId: priya._id,
      ventureId: truck1._id,
      amount: '80000',
      paidFrom: 'SBI Savings',
      remark: 'Fuel and registration',
      bankAccountId: truck1.bankAccounts[1]._id,
      bankAccountLabel: truck1.bankAccounts[1].label,
    },
    {
      partnerId: akshay._id,
      ventureId: truck1._id,
      amount: '50000',
      paidFrom: 'HDFC Savings',
      remark: 'Additional contribution',
      bankAccountId: truckHdfc._id,
      bankAccountLabel: truckHdfc.label,
    },
    {
      partnerId: akshay._id,
      ventureId: car1._id,
      amount: '200000',
      paidFrom: 'HDFC Savings',
      remark: 'Car purchase down payment',
      bankAccountId: carAxis._id,
      bankAccountLabel: carAxis.label,
    },
    {
      partnerId: priya._id,
      ventureId: car1._id,
      amount: '150000',
      paidFrom: 'Axis Bank',
      remark: 'Car investment share',
      bankAccountId: carAxis._id,
      bankAccountLabel: carAxis.label,
    },
  ];

  for (const t of sampleTxns) {
    await Transaction.create({
      ventureId: t.ventureId,
      type: 'CONTRIBUTION_IN',
      partnerId: t.partnerId,
      amount: mongoose.Types.Decimal128.fromString(t.amount),
      date: new Date(),
      paidFrom: t.paidFrom,
      remark: t.remark,
      bankAccountId: t.bankAccountId,
      bankAccountLabel: t.bankAccountLabel,
      categoryId: contribCat?._id,
      categoryName: contribCat?.name,
      createdById: t.partnerId,
    });
  }

  await Transaction.create({
    ventureId: truck1._id,
    type: 'EARNING_IN',
    partnerId: akshay._id,
    amount: mongoose.Types.Decimal128.fromString('45000'),
    date: new Date(),
    paidFrom: 'Trip booking — Delhi',
    remark: 'Freight earning deposited',
    bankAccountId: truckHdfc._id,
    bankAccountLabel: truckHdfc.label,
    categoryId: earningCat?._id,
    categoryName: earningCat?.name,
    createdById: akshay._id,
  });

  await Transaction.create({
    ventureId: truck1._id,
    type: 'EMI_FROM_BANK',
    partnerId: rahul._id,
    beneficiaryPartnerId: akshay._id,
    emiPeriod: '2026-01',
    amount: mongoose.Types.Decimal128.fromString('25000'),
    date: new Date(),
    paidFrom: 'HDFC Ops',
    remark: 'January EMI from project account',
    bankAccountId: truckHdfc._id,
    bankAccountLabel: truckHdfc.label,
    categoryId: emiCat?._id,
    categoryName: emiCat?.name,
    createdById: rahul._id,
  });

  console.log('Seed complete!');
  console.log('Admin: admin@apexledger.local / Admin123!');
  console.log('Partners: partner1@apexledger.local / Partner123! (Akshay, Rahul, Priya)');

  await disconnectDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

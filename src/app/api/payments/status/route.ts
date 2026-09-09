import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
export async function GET(){const razorpay=!!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET),cashfree=!!(process.env.CASHFREE_CLIENT_ID&&process.env.CASHFREE_CLIENT_SECRET);return NextResponse.json({partialCod:true,strategy:"confirmation_amount_plus_cod_balance",providers:{razorpay:{configured:razorpay},cashfree:{configured:cashfree}},anyConfigured:razorpay||cashfree},{headers:{"Cache-Control":"no-store"}});}

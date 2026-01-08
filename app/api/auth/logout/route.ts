import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/jwt';

export async function POST(_request: NextRequest) {
  try {
    await clearSessionCookie();
    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}

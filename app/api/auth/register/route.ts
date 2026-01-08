import { NextRequest, NextResponse } from 'next/server';
import { RegisterSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/bcrypt';
import { createJWT, setSessionCookie } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = RegisterSchema.parse(body);

    // Hash password
    const passwordHash = await hashPassword(validated.password);

    let user;
    try {
      // Create user
      user = await prisma.user.create({
        data: {
          email: validated.email,
          name: validated.name,
          passwordHash,
        },
      });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
      throw error;
    }

    // Create JWT and set cookie
    const token = await createJWT({
      userId: user.id,
      email: user.email,
    });

    await setSessionCookie(token);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}

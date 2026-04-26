import jwt, { type Secret, type SignOptions } from "jsonwebtoken"

const JWT_SECRET: Secret = process.env.JWT_SECRET as string
const JWT_EXPIRATION: string = process.env.JWT_EXPIRATION || "30d"

export type JWTPayload = {
    exp?: number
    iat?: number
    userId: number
}

/**
 * JWTトークンを生成
 */
export function generateToken(userId: number): string {
  const options = {
    expiresIn: JWT_EXPIRATION as SignOptions["expiresIn"]
  }
  return jwt.sign({ userId }, JWT_SECRET, options)
}

/**
 * JWTトークンを検証
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}
import { OAuth2Client } from "google-auth-library"

export type GoogleUserInfo = {
    email: string
    id: string
    name: string
    picture?: string
}

type GoogleUserInfoResponse = {
    email: string
    family_name?: string
    given_name?: string
    id: string
    locale?: string
    name: string
    picture?: string
    verified_email?: boolean
}

export type GoogleAuthUrlOptions = {
    accessType?: "offline" | "online"
    prompt?: "none" | "consent" | "select_account"
    scope?: string[]
    state?: string
}

/**
 * GoogleOAuthクライアントのインターフェース
 */
export interface IGoogleOAuthClient {
    generateAuthUrl(options?: GoogleAuthUrlOptions): string
    getUserInfo(code: string): Promise<GoogleUserInfo>
}

export class GoogleOAuthClient implements IGoogleOAuthClient {
  private oauth2Client: OAuth2Client

  constructor(clientId: string, clientSecret: string, callbackUrl: string) {
    this.oauth2Client = new OAuth2Client(clientId, clientSecret, callbackUrl)
  }

  public generateAuthUrl(options?: GoogleAuthUrlOptions): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: options?.accessType ?? "offline",
      prompt: options?.prompt ?? "consent",
      scope: options?.scope ?? [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ],
      state: options?.state
    })
  }

  public async getUserInfo(code: string): Promise<GoogleUserInfo> {
    const { tokens } = await this.oauth2Client.getToken(code)
    this.oauth2Client.setCredentials(tokens)

    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    })

    const data = await response.json() as GoogleUserInfoResponse

    return {
      email: data.email,
      id: data.id,
      name: data.name,
      picture: data.picture
    }
  }
}

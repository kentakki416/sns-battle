variable "domain_name" {
  description = "Route 53 で取得済みのルートドメイン（例: sns-battle-dev.com）"
  type        = string
}

variable "subdomain" {
  description = "環境用サブドメイン（例: dev）。証明書は *.<subdomain>.<domain> のワイルドカードを発行する"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB の DNS 名。指定すると api.<subdomain>.<domain> の A レコード (Alias) を作成する"
  type        = string
  default     = null
}

variable "alb_zone_id" {
  description = "ALB の Zone ID（Alias 用）"
  type        = string
  default     = null
}

variable "tags" {
  type    = map(string)
  default = {}
}

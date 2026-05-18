# =============================================================================
# Hosted Zone (Console で取得済みのドメインを参照)
# =============================================================================

data "aws_route53_zone" "this" {
  name         = var.domain_name
  private_zone = false
}

# =============================================================================
# ACM ワイルドカード証明書
# =============================================================================
# *.<subdomain>.<domain> をカバー。<domain> 自体は SAN に含めず、
# 環境別サブドメイン専用とする。

resource "aws_acm_certificate" "wildcard" {
  domain_name       = "*.${var.subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

# DNS 検証用レコードを Route 53 に自動作成
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.this.zone_id
}

# 検証完了を待機
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# =============================================================================
# A レコード (Alias) - api.<subdomain>.<domain> → ALB
# =============================================================================
# alb_dns_name が渡されたときだけ作成（ALB 作成後の post-init で有効化）

resource "aws_route53_record" "api" {
  count   = var.alb_dns_name != null ? 1 : 0
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "api.${var.subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

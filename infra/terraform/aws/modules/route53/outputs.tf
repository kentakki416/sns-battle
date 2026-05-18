output "zone_id" {
  description = "Route 53 hosted zone ID"
  value       = data.aws_route53_zone.this.zone_id
}

output "certificate_arn" {
  description = "検証完了済みの ACM 証明書 ARN（ALB の HTTPS listener にアタッチする）"
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "fqdn_api" {
  description = "API の FQDN（api.<subdomain>.<domain>）"
  value       = "api.${var.subdomain}.${var.domain_name}"
}

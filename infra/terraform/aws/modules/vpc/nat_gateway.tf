# =============================================================================
# NAT Gateway
# =============================================================================

locals {
  /**
   * NAT Gateway を配置する public subnet のキー。
   * - 呼び出し側から渡された nat_gateway_subnet_key を優先
   * - 未指定なら public subnet の中でキー名がアルファベット順で最初のものを自動選択
   *   (モジュール自己参照を避け、呼び出し側が subnet ID を解決できなくても動作させるため)
   */
  public_subnet_keys_sorted = sort([
    for key, subnet in var.subnets : key
    if subnet.subnet_type == "public"
  ])
  nat_gateway_subnet_key_resolved = var.nat_gateway_subnet_key != null ? var.nat_gateway_subnet_key : (
    length(local.public_subnet_keys_sorted) > 0 ? local.public_subnet_keys_sorted[0] : null
  )
}

resource "aws_nat_gateway" "nat" {
  count = var.create_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.subnets[local.nat_gateway_subnet_key_resolved].id

  tags = {
    Name = "${var.name}-nat"
  }

  depends_on = [aws_internet_gateway.igw]
}

# =============================================================================
# Elastic IP for NAT Gateway
# =============================================================================

resource "aws_eip" "nat" {
  count = var.create_nat_gateway ? 1 : 0

  domain = "vpc"

  tags = {
    Name = "${var.name}-nat-eip"
  }
}

# =============================================================================
# NAT Gateway
# =============================================================================

resource "aws_nat_gateway" "nat" {
  count = var.create_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.subnets[var.nat_gateway_subnet_key].id

  tags = {
    Name = "${var.name}-nat"
  }

  depends_on = [aws_internet_gateway.igw]

  /**
   * 設定ミスを plan 時に検出するためのガード。
   * 暗黙のフォールバックを許すと subnets の並び順や追加で NAT 位置が動いてしまうため、
   * 呼び出し側に明示的なキー指定を強制する。
   */
  lifecycle {
    precondition {
      condition     = var.nat_gateway_subnet_key != null
      error_message = "create_nat_gateway = true のとき、nat_gateway_subnet_key の指定が必須です。"
    }
    precondition {
      condition     = var.nat_gateway_subnet_key == null ? true : contains(keys(var.subnets), var.nat_gateway_subnet_key)
      error_message = "nat_gateway_subnet_key で指定したキーが subnets map に存在しません。"
    }
    precondition {
      condition     = var.nat_gateway_subnet_key == null || !contains(keys(var.subnets), coalesce(var.nat_gateway_subnet_key, "_")) ? true : var.subnets[var.nat_gateway_subnet_key].subnet_type == "public"
      error_message = "nat_gateway_subnet_key には subnet_type = \"public\" のサブネットを指定する必要があります。"
    }
  }
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

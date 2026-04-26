# =============================================================================
# ECS Module Variables
# =============================================================================

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "task_definition_family" {
  description = "Task definition family name"
  type        = string
}

variable "cpu" {
  description = "CPU units for the task"
  type        = string
}

variable "memory" {
  description = "Memory for the task"
  type        = string
}

variable "container_name" {
  description = "Container name"
  type        = string
}

variable "container_image" {
  description = "Container image"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
}

variable "service_name" {
  description = "ECS service name"
  type        = string
}

variable "desired_count" {
  description = "Desired number of running tasks"
  type        = number
  default     = 1
}

variable "network_configuration" {
  description = "Network configuration for ECS service"
  type = object({
    subnets          = list(string)
    security_groups  = list(string)
    assign_public_ip = bool
  })
}

variable "target_group_arn" {
  description = "Target group ARN for load balancer"
  type        = string
  default     = ""
}

variable "enable_blue_green" {
  description = "Enable Blue/Green deployment strategy"
  type        = bool
  default     = false
}

variable "blue_green_configuration" {
  description = "Blue/Green deployment configuration"
  type = object({
    alternate_target_group_arn   = string
    production_listener_rule_arn = string
    test_listener_rule_arn       = optional(string)
    bake_time_in_minutes         = number
  })
  default = null
}

variable "log_retention_in_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to ECS resources"
  type        = map(string)
  default     = {}
}

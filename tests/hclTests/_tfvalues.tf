variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "regionTwo" {
  description = "AWS region"
  type        = string
  default     = "$[env:foo]"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "configorama-test"
}

variable "instance_count" {
  description = "Number of instances"
  type        = number
  default     = 3
}

variable "enabled" {
  description = "Feature flag"
  type        = bool
  default     = true
}

locals {
  environment = "production"
  full_name   = "myapp-prod"
}

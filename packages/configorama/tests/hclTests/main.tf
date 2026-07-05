variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "instance_count" {
  description = "Number of instances $[env:foo]"
  type        = number
  default     = 2
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default = {
    Project = "ConfigoramaTest"
    Owner   = "DevOps"
  }
}

locals {
  app_name = "myapp-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Region      = var.region
    }
  )
}

resource "aws_instance" "app" {
  count         = var.instance_count
  ami           = "ami-12345678"
  instance_type = "t3.micro"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.app_name}-${count.index}"
    }
  )
}

output "instance_ids" {
  description = "IDs of created instances"
  value       = aws_instance.app[*].id
}

output "app_name" {
  description = "Application name"
  value       = local.app_name
}

variable "name" {
  description = "Name to be used"
  type        = string
  default     = "test"
}

variable "count" {
  description = "Number of resources"
  type        = number
  default     = 1
}

variable "enabled" {
  description = "Whether to enable feature"
  type        = bool
  default     = true
}

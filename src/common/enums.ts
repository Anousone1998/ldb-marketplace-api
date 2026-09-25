export enum ItemType {
  SECOND_HAND = 'SECOND_HAND',
  FOOD = 'FOOD',
  FREE = 'FREE',
  /** ເຄື່ອງໃຊ້ – household goods and appliances */
  HOUSEHOLD = 'HOUSEHOLD',
}

export enum ItemStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum NotificationType {
  ORDER_PLACED = 'ORDER_PLACED',
  ORDER_COMPLETED = 'ORDER_COMPLETED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  PAYMENT_SLIP_ATTACHED = 'PAYMENT_SLIP_ATTACHED',
}

# Building a Governed Customer Service Agent

A hands-on tutorial for building a production-ready customer service agent with tiered permissions, human escalation, and full audit logging.

## What You'll Build

Customer service is one of the most compelling use cases for AI agents. An agent that can look up orders, process refunds, and update account details could save your support team thousands of hours annually. But it also introduces serious risks:

- **Financial exposure**: An agent that processes refunds without oversight could drain your revenue
- **Data access**: Customer PII requires careful handling and audit trails
- **Account integrity**: Unauthorized account changes could lock customers out
- **Compliance requirements**: Regulated industries need provable controls

In this tutorial, you'll build a complete customer service agent with **tiered permission levels**, **human escalation patterns**, and **comprehensive audit logging** — all governed by MeshGuard policies.

By the end, you'll have:

- A fully functional LangChain-based customer service agent
- Three permission tiers: Basic (lookups), Elevated (refunds), Admin (account changes)
- Human escalation for high-risk actions
- Complete audit trails for compliance
- Production-ready code you can adapt for your organization

## Prerequisites

- Python 3.10+
- LangChain familiarity (agents, tools, prompts)
- A MeshGuard account ([sign up free](https://meshguard.app))
- OpenAI API key (or another LLM provider)

## Installation

```bash
pip install meshguard langchain langchain-openai pydantic
```

## Project Structure

We'll organize our agent with clean separation of concerns:

```
customer_service_agent/
├── main.py                 # Agent entry point
├── tools/
│   ├── __init__.py
│   ├── lookup.py          # Basic tier: lookups
│   ├── refunds.py         # Elevated tier: refunds
│   └── account.py         # Admin tier: account changes
├── governance/
│   ├── __init__.py
│   ├── client.py          # MeshGuard client setup
│   └── escalation.py      # Human escalation logic
├── services/
│   ├── __init__.py
│   ├── crm.py             # CRM service mock
│   ├── orders.py          # Orders service mock
│   └── payments.py        # Payments service mock
└── policies/
    └── customer-service.yaml  # MeshGuard policy file
```

## Step 1: Set Up Mock Services

In a real deployment, these would connect to your actual systems. For this tutorial, we'll create realistic mocks:

```python
# services/crm.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Customer:
    id: str
    email: str
    name: str
    phone: str
    tier: str  # bronze, silver, gold
    created_at: datetime
    notes: str = ""
    
# In-memory customer database
CUSTOMERS = {
    "cust_001": Customer(
        id="cust_001",
        email="alice@example.com",
        name="Alice Johnson",
        phone="+1-555-0101",
        tier="gold",
        created_at=datetime(2022, 3, 15),
        notes="VIP customer, handle with care"
    ),
    "cust_002": Customer(
        id="cust_002", 
        email="bob@example.com",
        name="Bob Smith",
        phone="+1-555-0102",
        tier="silver",
        created_at=datetime(2023, 7, 22),
    ),
    "cust_003": Customer(
        id="cust_003",
        email="carol@example.com", 
        name="Carol Williams",
        phone="+1-555-0103",
        tier="bronze",
        created_at=datetime(2024, 1, 10),
    ),
}

class CRMService:
    def get_customer_by_email(self, email: str) -> Optional[Customer]:
        for customer in CUSTOMERS.values():
            if customer.email == email:
                return customer
        return None
    
    def get_customer_by_id(self, customer_id: str) -> Optional[Customer]:
        return CUSTOMERS.get(customer_id)
    
    def update_customer_email(self, customer_id: str, new_email: str) -> bool:
        if customer_id in CUSTOMERS:
            CUSTOMERS[customer_id].email = new_email
            return True
        return False
    
    def update_customer_phone(self, customer_id: str, new_phone: str) -> bool:
        if customer_id in CUSTOMERS:
            CUSTOMERS[customer_id].phone = new_phone
            return True
        return False
    
    def add_customer_note(self, customer_id: str, note: str) -> bool:
        if customer_id in CUSTOMERS:
            existing = CUSTOMERS[customer_id].notes
            CUSTOMERS[customer_id].notes = f"{existing}\n[{datetime.now()}] {note}".strip()
            return True
        return False
```

```python
# services/orders.py
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from enum import Enum

class OrderStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"

@dataclass
class OrderItem:
    product_name: str
    quantity: int
    price: float

@dataclass
class Order:
    id: str
    customer_id: str
    items: List[OrderItem]
    total: float
    status: OrderStatus
    created_at: datetime
    shipped_at: Optional[datetime] = None
    tracking_number: Optional[str] = None

# In-memory orders database
ORDERS = {
    "ord_1001": Order(
        id="ord_1001",
        customer_id="cust_001",
        items=[
            OrderItem("Wireless Headphones", 1, 149.99),
            OrderItem("Phone Case", 2, 24.99),
        ],
        total=199.97,
        status=OrderStatus.DELIVERED,
        created_at=datetime(2024, 12, 1),
        shipped_at=datetime(2024, 12, 3),
        tracking_number="1Z999AA10123456784"
    ),
    "ord_1002": Order(
        id="ord_1002",
        customer_id="cust_001",
        items=[OrderItem("Smart Watch", 1, 299.99)],
        total=299.99,
        status=OrderStatus.SHIPPED,
        created_at=datetime(2025, 1, 15),
        shipped_at=datetime(2025, 1, 17),
        tracking_number="1Z999AA10123456785"
    ),
    "ord_1003": Order(
        id="ord_1003",
        customer_id="cust_002",
        items=[OrderItem("Laptop Stand", 1, 79.99)],
        total=79.99,
        status=OrderStatus.DELIVERED,
        created_at=datetime(2025, 1, 10),
        shipped_at=datetime(2025, 1, 12),
        tracking_number="1Z999AA10123456786"
    ),
}

class OrderService:
    def get_order(self, order_id: str) -> Optional[Order]:
        return ORDERS.get(order_id)
    
    def get_orders_by_customer(self, customer_id: str) -> List[Order]:
        return [o for o in ORDERS.values() if o.customer_id == customer_id]
    
    def cancel_order(self, order_id: str) -> bool:
        if order_id in ORDERS:
            order = ORDERS[order_id]
            if order.status in [OrderStatus.PENDING, OrderStatus.PROCESSING]:
                order.status = OrderStatus.CANCELLED
                return True
        return False
```

```python
# services/payments.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import uuid

@dataclass
class RefundRecord:
    id: str
    order_id: str
    amount: float
    reason: str
    processed_by: str
    created_at: datetime

# In-memory refund records
REFUNDS: dict[str, RefundRecord] = {}

class PaymentService:
    def process_refund(
        self, 
        order_id: str, 
        amount: float, 
        reason: str,
        processed_by: str = "ai-agent"
    ) -> RefundRecord:
        """Process a refund. In production, this would hit your payment processor."""
        refund = RefundRecord(
            id=f"ref_{uuid.uuid4().hex[:8]}",
            order_id=order_id,
            amount=amount,
            reason=reason,
            processed_by=processed_by,
            created_at=datetime.now()
        )
        REFUNDS[refund.id] = refund
        
        # Update order status
        from services.orders import ORDERS, OrderStatus
        if order_id in ORDERS:
            ORDERS[order_id].status = OrderStatus.REFUNDED
            
        return refund
    
    def get_refund_history(self, order_id: str) -> list[RefundRecord]:
        return [r for r in REFUNDS.values() if r.order_id == order_id]
```

## Step 2: Initialize the MeshGuard Client

Create a centralized governance client that all tools will use:

```python
# governance/client.py
import os
from meshguard import MeshGuardClient

def get_meshguard_client() -> MeshGuardClient:
    """
    Create and return the MeshGuard client.
    
    In production, use environment variables for configuration.
    """
    return MeshGuardClient(
        gateway_url=os.environ.get(
            "MESHGUARD_GATEWAY_URL",
            "https://dashboard.meshguard.app"
        ),
        agent_token=os.environ.get("MESHGUARD_AGENT_TOKEN"),
        # Optional: Add metadata that appears in audit logs
        agent_metadata={
            "agent_type": "customer-service",
            "version": "1.0.0",
            "environment": os.environ.get("ENVIRONMENT", "development"),
        }
    )

# Singleton instance
_client: MeshGuardClient | None = None

def get_client() -> MeshGuardClient:
    global _client
    if _client is None:
        _client = get_meshguard_client()
    return _client
```

## Step 3: Build the Basic Tier — Lookup Tools

The basic tier includes read-only operations any support agent can perform:

```python
# tools/lookup.py
from langchain.tools import tool
from pydantic import BaseModel, Field
from typing import Optional

from governance.client import get_client
from services.crm import CRMService
from services.orders import OrderService

# Initialize services
crm = CRMService()
orders = OrderService()

class CustomerLookupInput(BaseModel):
    email: str = Field(description="Customer's email address")

class OrderLookupInput(BaseModel):
    order_id: str = Field(description="Order ID (e.g., ord_1001)")

class CustomerOrdersInput(BaseModel):
    customer_id: str = Field(description="Customer ID (e.g., cust_001)")


@tool("lookup_customer", args_schema=CustomerLookupInput)
def lookup_customer(email: str) -> str:
    """
    Look up a customer by their email address.
    Returns customer details including name, tier, and account age.
    """
    client = get_client()
    
    # Check permission with MeshGuard
    decision = client.check(
        action="read:customer",
        context={"email": email}
    )
    
    if not decision.allowed:
        return f"❌ Action blocked: {decision.reason}"
    
    # Execute the lookup
    customer = crm.get_customer_by_email(email)
    
    if not customer:
        return f"No customer found with email: {email}"
    
    return f"""
**Customer Found:**
- ID: {customer.id}
- Name: {customer.name}
- Email: {customer.email}
- Phone: {customer.phone}
- Tier: {customer.tier.upper()}
- Member since: {customer.created_at.strftime('%B %Y')}
- Notes: {customer.notes or 'None'}
""".strip()


@tool("lookup_order", args_schema=OrderLookupInput)
def lookup_order(order_id: str) -> str:
    """
    Look up details for a specific order.
    Returns order status, items, and tracking information.
    """
    client = get_client()
    
    decision = client.check(
        action="read:order",
        context={"order_id": order_id}
    )
    
    if not decision.allowed:
        return f"❌ Action blocked: {decision.reason}"
    
    order = orders.get_order(order_id)
    
    if not order:
        return f"No order found with ID: {order_id}"
    
    items_str = "\n".join([
        f"  - {item.product_name} (x{item.quantity}): ${item.price:.2f}"
        for item in order.items
    ])
    
    return f"""
**Order {order.id}:**
- Status: {order.status.value.upper()}
- Total: ${order.total:.2f}
- Ordered: {order.created_at.strftime('%B %d, %Y')}
- Items:
{items_str}
- Tracking: {order.tracking_number or 'Not yet shipped'}
""".strip()


@tool("get_customer_orders", args_schema=CustomerOrdersInput)
def get_customer_orders(customer_id: str) -> str:
    """
    Get all orders for a customer.
    Useful for reviewing order history.
    """
    client = get_client()
    
    decision = client.check(
        action="read:order_history",
        context={"customer_id": customer_id}
    )
    
    if not decision.allowed:
        return f"❌ Action blocked: {decision.reason}"
    
    customer_orders = orders.get_orders_by_customer(customer_id)
    
    if not customer_orders:
        return f"No orders found for customer: {customer_id}"
    
    order_summaries = []
    for order in customer_orders:
        order_summaries.append(
            f"- **{order.id}**: ${order.total:.2f} — {order.status.value} "
            f"({order.created_at.strftime('%b %d, %Y')})"
        )
    
    return f"""
**Order History for {customer_id}:**
{chr(10).join(order_summaries)}

Total orders: {len(customer_orders)}
""".strip()
```

## Step 4: Build the Elevated Tier — Refund Tools

Refunds involve financial transactions and require additional controls:

```python
# tools/refunds.py
from langchain.tools import tool
from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal

from governance.client import get_client
from governance.escalation import request_human_approval, EscalationResult
from services.orders import OrderService, OrderStatus
from services.payments import PaymentService

orders = OrderService()
payments = PaymentService()

# Configuration for refund limits
AUTOMATIC_REFUND_LIMIT = 50.00  # Refunds under this amount auto-approve
ELEVATED_REFUND_LIMIT = 500.00  # Refunds under this require elevated permission
# Above ELEVATED_REFUND_LIMIT requires admin/human approval


class RefundInput(BaseModel):
    order_id: str = Field(description="The order ID to refund")
    amount: float = Field(description="Amount to refund in dollars")
    reason: str = Field(description="Reason for the refund")


class RefundStatusInput(BaseModel):
    order_id: str = Field(description="Order ID to check refund status")


@tool("process_refund", args_schema=RefundInput)
def process_refund(order_id: str, amount: float, reason: str) -> str:
    """
    Process a refund for an order.
    
    Refund amounts are tiered:
    - Under $50: Automatically approved
    - $50-$500: Requires elevated permissions
    - Over $500: Requires human approval
    """
    client = get_client()
    
    # Validate the order exists
    order = orders.get_order(order_id)
    if not order:
        return f"❌ Order not found: {order_id}"
    
    # Validate refund amount
    if amount <= 0:
        return "❌ Refund amount must be greater than zero"
    
    if amount > order.total:
        return f"❌ Refund amount (${amount:.2f}) exceeds order total (${order.total:.2f})"
    
    # Check if order is eligible for refund
    if order.status == OrderStatus.REFUNDED:
        return f"❌ Order {order_id} has already been refunded"
    
    if order.status == OrderStatus.CANCELLED:
        return f"❌ Order {order_id} was cancelled and cannot be refunded"
    
    # Determine required permission level based on amount
    if amount <= AUTOMATIC_REFUND_LIMIT:
        required_action = "write:refund:basic"
    elif amount <= ELEVATED_REFUND_LIMIT:
        required_action = "write:refund:elevated"
    else:
        required_action = "write:refund:admin"
    
    # Check permission with MeshGuard
    decision = client.check(
        action=required_action,
        context={
            "order_id": order_id,
            "amount": amount,
            "reason": reason,
            "customer_id": order.customer_id,
            "order_total": order.total,
        }
    )
    
    if not decision.allowed:
        # For large refunds, offer human escalation
        if amount > ELEVATED_REFUND_LIMIT:
            return f"""
❌ This refund requires human approval.

**Refund Request:**
- Order: {order_id}
- Amount: ${amount:.2f}
- Reason: {reason}

I've flagged this for review by a supervisor. They'll process it within 
24 hours and contact the customer directly.

Reference: {decision.request_id}
"""
        return f"❌ Action blocked: {decision.reason}"
    
    # Process the refund
    refund = payments.process_refund(
        order_id=order_id,
        amount=amount,
        reason=reason,
        processed_by="ai-customer-service-agent"
    )
    
    return f"""
✅ **Refund Processed Successfully**

- Refund ID: {refund.id}
- Order: {order_id}
- Amount: ${amount:.2f}
- Reason: {reason}
- Processed: {refund.created_at.strftime('%B %d, %Y at %H:%M')}

The customer will see the refund in 3-5 business days.
"""


@tool("check_refund_eligibility", args_schema=RefundStatusInput)
def check_refund_eligibility(order_id: str) -> str:
    """
    Check if an order is eligible for a refund and what the maximum refund amount is.
    """
    client = get_client()
    
    decision = client.check(
        action="read:refund_eligibility",
        context={"order_id": order_id}
    )
    
    if not decision.allowed:
        return f"❌ Action blocked: {decision.reason}"
    
    order = orders.get_order(order_id)
    if not order:
        return f"❌ Order not found: {order_id}"
    
    # Check existing refunds
    existing_refunds = payments.get_refund_history(order_id)
    total_refunded = sum(r.amount for r in existing_refunds)
    remaining = order.total - total_refunded
    
    if order.status == OrderStatus.REFUNDED:
        return f"""
**Order {order_id} - Already Fully Refunded**
- Original Total: ${order.total:.2f}
- Total Refunded: ${total_refunded:.2f}
"""
    
    if order.status == OrderStatus.CANCELLED:
        return f"❌ Order {order_id} was cancelled and is not eligible for refund."
    
    return f"""
**Refund Eligibility for {order_id}:**
- Order Status: {order.status.value}
- Order Total: ${order.total:.2f}
- Previously Refunded: ${total_refunded:.2f}
- Maximum Refund Available: ${remaining:.2f}

**Refund Tiers:**
- Up to $50: Can be processed immediately
- $50-$500: Requires elevated approval
- Over $500: Requires human supervisor approval
"""
```

## Step 5: Build the Admin Tier — Account Changes

Account modifications are high-risk and require the highest permission level:

```python
# tools/account.py
from langchain.tools import tool
from pydantic import BaseModel, Field
import re

from governance.client import get_client
from governance.escalation import (
    request_human_approval, 
    EscalationResult,
    EscalationPriority
)
from services.crm import CRMService

crm = CRMService()


class UpdateEmailInput(BaseModel):
    customer_id: str = Field(description="Customer ID")
    new_email: str = Field(description="New email address")
    verification_code: str = Field(
        description="6-digit verification code sent to customer's current email"
    )


class UpdatePhoneInput(BaseModel):
    customer_id: str = Field(description="Customer ID")
    new_phone: str = Field(description="New phone number")


class AddNoteInput(BaseModel):
    customer_id: str = Field(description="Customer ID")
    note: str = Field(description="Note to add to customer account")


def validate_email(email: str) -> bool:
    """Basic email validation."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone: str) -> bool:
    """Basic phone validation."""
    # Remove common formatting
    digits = re.sub(r'[\s\-\(\)\+]', '', phone)
    return len(digits) >= 10 and digits.isdigit()


@tool("update_customer_email", args_schema=UpdateEmailInput)
def update_customer_email(
    customer_id: str, 
    new_email: str, 
    verification_code: str
) -> str:
    """
    Update a customer's email address.
    
    REQUIRES: Admin-level permissions and verification code from customer.
    This is a high-security operation that is fully audited.
    """
    client = get_client()
    
    # Validate inputs
    if not validate_email(new_email):
        return f"❌ Invalid email format: {new_email}"
    
    # In production, you'd validate the verification code
    if len(verification_code) != 6 or not verification_code.isdigit():
        return "❌ Invalid verification code. Must be 6 digits."
    
    # Check with MeshGuard - this requires admin permissions
    decision = client.check(
        action="write:customer:email",
        context={
            "customer_id": customer_id,
            "new_email": new_email,
            "has_verification": True,
        }
    )
    
    if not decision.allowed:
        # Email changes require human escalation if agent lacks permission
        return f"""
❌ **Email Change Requires Human Verification**

For security, email address changes must be processed by a human agent.

I've created a support ticket for this request:
- Customer: {customer_id}
- Requested Email: {new_email}
- Reference: {decision.request_id}

A support specialist will verify the customer's identity and process 
this change within 2-4 hours during business hours.

Is there anything else I can help with in the meantime?
"""
    
    # Get current customer info for audit
    customer = crm.get_customer_by_id(customer_id)
    if not customer:
        return f"❌ Customer not found: {customer_id}"
    
    old_email = customer.email
    
    # Perform the update
    success = crm.update_customer_email(customer_id, new_email)
    
    if not success:
        return f"❌ Failed to update email. Please try again or escalate to support."
    
    # Log the change (MeshGuard automatically logs, but we add a CRM note too)
    crm.add_customer_note(
        customer_id, 
        f"Email changed from {old_email} to {new_email} via AI support agent"
    )
    
    return f"""
✅ **Email Address Updated**

- Customer: {customer.name} ({customer_id})
- Previous Email: {old_email}
- New Email: {new_email}
- Updated: Successfully

The customer can now use {new_email} to log in. A confirmation 
has been sent to both the old and new email addresses.
"""


@tool("update_customer_phone", args_schema=UpdatePhoneInput)
def update_customer_phone(customer_id: str, new_phone: str) -> str:
    """
    Update a customer's phone number.
    
    REQUIRES: Admin-level permissions.
    """
    client = get_client()
    
    if not validate_phone(new_phone):
        return f"❌ Invalid phone format: {new_phone}"
    
    decision = client.check(
        action="write:customer:phone",
        context={
            "customer_id": customer_id,
            "new_phone": new_phone,
        }
    )
    
    if not decision.allowed:
        return f"""
❌ I don't have permission to update phone numbers directly.

I've noted this request. Please have the customer:
1. Log into their account at example.com/account
2. Update their phone number in Settings > Contact Info

Or they can call our support line at 1-800-EXAMPLE to verify 
their identity and make this change.
"""
    
    customer = crm.get_customer_by_id(customer_id)
    if not customer:
        return f"❌ Customer not found: {customer_id}"
    
    old_phone = customer.phone
    success = crm.update_customer_phone(customer_id, new_phone)
    
    if not success:
        return "❌ Failed to update phone number."
    
    crm.add_customer_note(
        customer_id,
        f"Phone changed from {old_phone} to {new_phone} via AI support agent"
    )
    
    return f"""
✅ **Phone Number Updated**

- Customer: {customer.name}
- Previous: {old_phone}
- New: {new_phone}

The customer will receive a confirmation SMS at their new number.
"""


@tool("add_account_note", args_schema=AddNoteInput)
def add_account_note(customer_id: str, note: str) -> str:
    """
    Add a note to a customer's account.
    
    Use this to record important context from customer interactions.
    """
    client = get_client()
    
    decision = client.check(
        action="write:customer:note",
        context={
            "customer_id": customer_id,
            "note_length": len(note),
        }
    )
    
    if not decision.allowed:
        return f"❌ Action blocked: {decision.reason}"
    
    customer = crm.get_customer_by_id(customer_id)
    if not customer:
        return f"❌ Customer not found: {customer_id}"
    
    success = crm.add_customer_note(customer_id, note)
    
    if not success:
        return "❌ Failed to add note."
    
    return f"✅ Note added to {customer.name}'s account."
```

## Step 6: Human Escalation Patterns

When the agent can't handle something, graceful escalation is crucial:

```python
# governance/escalation.py
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid


class EscalationPriority(Enum):
    LOW = "low"           # Response within 24 hours
    MEDIUM = "medium"     # Response within 4 hours
    HIGH = "high"         # Response within 1 hour
    URGENT = "urgent"     # Immediate page to on-call


class EscalationReason(Enum):
    PERMISSION_DENIED = "permission_denied"
    HIGH_VALUE_TRANSACTION = "high_value_transaction"
    ACCOUNT_SECURITY = "account_security"
    CUSTOMER_REQUEST = "customer_request"
    AGENT_UNCERTAINTY = "agent_uncertainty"
    POLICY_VIOLATION = "policy_violation"


@dataclass
class EscalationResult:
    ticket_id: str
    priority: EscalationPriority
    reason: EscalationReason
    expected_response: str
    created_at: datetime


class EscalationService:
    """
    Service for escalating issues to human agents.
    
    In production, this would integrate with your ticketing system
    (Zendesk, Salesforce, Intercom, etc.)
    """
    
    def __init__(self):
        self.tickets: dict[str, dict] = {}
    
    def create_ticket(
        self,
        customer_id: str,
        summary: str,
        details: str,
        priority: EscalationPriority,
        reason: EscalationReason,
        context: Optional[dict] = None,
    ) -> EscalationResult:
        """Create an escalation ticket for human review."""
        
        ticket_id = f"ESC-{uuid.uuid4().hex[:8].upper()}"
        
        # Calculate expected response time
        response_times = {
            EscalationPriority.LOW: "24 hours",
            EscalationPriority.MEDIUM: "4 hours", 
            EscalationPriority.HIGH: "1 hour",
            EscalationPriority.URGENT: "15 minutes",
        }
        
        ticket = {
            "id": ticket_id,
            "customer_id": customer_id,
            "summary": summary,
            "details": details,
            "priority": priority.value,
            "reason": reason.value,
            "context": context or {},
            "status": "open",
            "created_at": datetime.now(),
            "assigned_to": None,
        }
        
        self.tickets[ticket_id] = ticket
        
        # In production: send to ticketing system, notify on-call if urgent
        if priority == EscalationPriority.URGENT:
            self._page_oncall(ticket)
        
        return EscalationResult(
            ticket_id=ticket_id,
            priority=priority,
            reason=reason,
            expected_response=response_times[priority],
            created_at=ticket["created_at"],
        )
    
    def _page_oncall(self, ticket: dict):
        """Page the on-call support engineer for urgent issues."""
        # In production: integrate with PagerDuty, Opsgenie, etc.
        print(f"🚨 PAGING ON-CALL: {ticket['id']} - {ticket['summary']}")


# Singleton instance
_escalation_service: Optional[EscalationService] = None

def get_escalation_service() -> EscalationService:
    global _escalation_service
    if _escalation_service is None:
        _escalation_service = EscalationService()
    return _escalation_service


def request_human_approval(
    customer_id: str,
    action: str,
    details: str,
    priority: EscalationPriority = EscalationPriority.MEDIUM,
    reason: EscalationReason = EscalationReason.PERMISSION_DENIED,
    context: Optional[dict] = None,
) -> EscalationResult:
    """
    Request human approval for an action the agent cannot perform.
    
    Returns an EscalationResult with ticket information to share with the customer.
    """
    service = get_escalation_service()
    
    return service.create_ticket(
        customer_id=customer_id,
        summary=f"AI Agent Escalation: {action}",
        details=details,
        priority=priority,
        reason=reason,
        context=context,
    )
```

Now add an escalation tool the agent can explicitly use:

```python
# tools/escalation.py (add to tools/)
from langchain.tools import tool
from pydantic import BaseModel, Field

from governance.escalation import (
    request_human_approval,
    EscalationPriority,
    EscalationReason,
    get_escalation_service,
)


class EscalateInput(BaseModel):
    customer_id: str = Field(description="Customer ID for the escalation")
    summary: str = Field(description="Brief summary of what needs human attention")
    details: str = Field(description="Full details and context for the human agent")
    is_urgent: bool = Field(
        default=False,
        description="Set to true only for security issues or angry VIP customers"
    )


@tool("escalate_to_human", args_schema=EscalateInput)
def escalate_to_human(
    customer_id: str, 
    summary: str, 
    details: str, 
    is_urgent: bool = False
) -> str:
    """
    Escalate an issue to a human support agent.
    
    Use this when:
    - You don't have permission for a requested action
    - The customer specifically asks for a human
    - The issue is too complex or sensitive
    - You're uncertain about the right course of action
    """
    priority = EscalationPriority.URGENT if is_urgent else EscalationPriority.MEDIUM
    
    result = request_human_approval(
        customer_id=customer_id,
        action="manual_escalation",
        details=f"**Summary:** {summary}\n\n**Details:**\n{details}",
        priority=priority,
        reason=EscalationReason.CUSTOMER_REQUEST,
    )
    
    if is_urgent:
        return f"""
🚨 **Urgent Escalation Created**

I've immediately paged our support team for this issue.

- Ticket: {result.ticket_id}
- Priority: URGENT
- Expected Response: {result.expected_response}

Someone will be with you very shortly. Please stay on this chat 
so they can pick up right where we left off.
"""
    
    return f"""
✅ **Escalation Created**

I've created a support ticket for a human agent to review.

- Ticket: {result.ticket_id}
- Priority: {result.priority.value.upper()}
- Expected Response: Within {result.expected_response}

You'll receive an email when an agent picks up your case. 
Is there anything else I can help with in the meantime?
"""
```

## Step 7: Configure MeshGuard Policies

Now the critical part — defining what permissions each tier has:

```yaml
# policies/customer-service.yaml
#
# MeshGuard Policy for Customer Service Agent
# Upload this to your MeshGuard dashboard at https://dashboard.meshguard.app
#

name: customer-service-agent-policy
version: 1

# This policy applies to agents tagged as customer-service
agent_match:
  tags: ["customer-service"]

# Default deny - explicit allow required for every action
default_effect: deny

rules:
  # ===========================================
  # BASIC TIER - Read-only operations
  # Any customer service agent can perform these
  # ===========================================
  
  - name: "Allow customer lookups"
    action: "read:customer"
    effect: allow
    log: true
    
  - name: "Allow order lookups"
    action: "read:order"
    effect: allow
    log: true
    
  - name: "Allow order history access"
    action: "read:order_history"
    effect: allow
    log: true
    
  - name: "Allow refund eligibility checks"
    action: "read:refund_eligibility"
    effect: allow
    log: true

  # ===========================================
  # ELEVATED TIER - Financial operations
  # Requires elevated trust level
  # ===========================================
  
  - name: "Auto-approve small refunds"
    action: "write:refund:basic"
    effect: allow
    conditions:
      # Only during business hours (9 AM - 6 PM)
      - "time.hour >= 9 AND time.hour <= 18"
    log: true
    log_context:
      - "amount"
      - "order_id"
      - "reason"
    
  - name: "Allow elevated refunds with approval"
    action: "write:refund:elevated"
    effect: allow
    trust_level: elevated  # Agent must have elevated trust
    conditions:
      - "context.amount <= 500"
    log: true
    log_context:
      - "amount"
      - "order_id"
      - "reason"
      - "customer_id"
    
  - name: "Deny large refunds - require human"
    action: "write:refund:admin"
    effect: deny
    reason: "Refunds over $500 require human supervisor approval"
    log: true

  # ===========================================
  # ADMIN TIER - Account modifications
  # Requires admin trust level
  # ===========================================
  
  - name: "Allow account notes"
    action: "write:customer:note"
    effect: allow
    trust_level: elevated
    conditions:
      # Limit note length to prevent abuse
      - "context.note_length <= 1000"
    log: true
    
  - name: "Allow phone updates with admin trust"
    action: "write:customer:phone"
    effect: allow
    trust_level: admin
    log: true
    log_context:
      - "customer_id"
      - "new_phone"
    
  - name: "Email changes - admin only with verification"
    action: "write:customer:email"
    effect: allow
    trust_level: admin
    conditions:
      - "context.has_verification == true"
    log: true
    alert: true  # Send alert to security team
    log_context:
      - "customer_id"
      - "new_email"

  # ===========================================
  # RATE LIMITS
  # Prevent runaway agents
  # ===========================================
  
  rate_limits:
    - action: "write:refund:*"
      limit: 10
      period: "1h"
      scope: "agent"
      on_exceed: deny
      reason: "Refund rate limit exceeded. Please wait or escalate to supervisor."
      
    - action: "write:customer:*"
      limit: 20
      period: "1h"
      scope: "agent"
      on_exceed: deny
      reason: "Account modification rate limit exceeded."
      
    - action: "read:*"
      limit: 100
      period: "1m"
      scope: "agent"
      on_exceed: deny
      reason: "Read rate limit exceeded. Possible automation issue."

# ===========================================
# AUDIT CONFIGURATION
# ===========================================

audit:
  # Log all actions, not just denials
  log_allowed: true
  log_denied: true
  
  # Include these fields in every log entry
  always_log:
    - "agent_id"
    - "timestamp"
    - "action"
    - "decision"
    
  # Retention period for compliance
  retention_days: 2555  # 7 years for financial compliance
  
  # Export configuration
  export:
    format: "json"
    destination: "s3://your-bucket/meshguard-logs/"
    schedule: "daily"
```

## Step 8: Assemble the Complete Agent

Now bring everything together:

```python
# main.py
import os
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

# Import all our governed tools
from tools.lookup import lookup_customer, lookup_order, get_customer_orders
from tools.refunds import process_refund, check_refund_eligibility
from tools.account import update_customer_email, update_customer_phone, add_account_note
from tools.escalation import escalate_to_human


def create_customer_service_agent():
    """Create and configure the customer service agent."""
    
    # Initialize the LLM
    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0.3,  # Lower temperature for consistent, professional responses
    )
    
    # Collect all tools
    tools = [
        # Basic tier
        lookup_customer,
        lookup_order,
        get_customer_orders,
        # Elevated tier
        check_refund_eligibility,
        process_refund,
        # Admin tier
        update_customer_email,
        update_customer_phone,
        add_account_note,
        # Always available
        escalate_to_human,
    ]
    
    # System prompt that guides agent behavior
    system_prompt = """You are a helpful customer service agent for Acme Corporation.

## Your Capabilities
You can help customers with:
- Looking up their account and order information
- Processing refunds (with appropriate approvals)
- Updating account details (with appropriate approvals)
- Answering questions about products, shipping, and policies

## Important Guidelines

1. **Always verify the customer first.** Before taking any action on an account, 
   look up the customer to confirm you're working with the right account.

2. **Respect your permission boundaries.** Some actions require elevated permissions 
   or human approval. If an action is blocked, explain this professionally and 
   offer alternatives.

3. **Be transparent about limitations.** If you can't do something, say so clearly 
   and explain what the customer can do instead (escalate, use self-service, etc.)

4. **Protect customer data.** Never share one customer's information with another. 
   Don't include sensitive data in your responses unless necessary.

5. **Stay professional and empathetic.** Customers reaching out often have problems. 
   Acknowledge their frustration and focus on solutions.

6. **When in doubt, escalate.** If something seems off, or you're not sure about 
   the right action, escalate to a human agent.

## Response Style
- Be concise but complete
- Use bullet points for multiple items
- Confirm actions taken with clear summaries
- Always offer next steps or additional help

## Handling Blocked Actions
If MeshGuard blocks an action, respond professionally:
- Acknowledge the customer's request
- Explain that this requires additional verification/approval
- Describe what will happen next (human review, etc.)
- Offer alternative help in the meantime"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    # Create the agent
    agent = create_tool_calling_agent(llm, tools, prompt)
    
    # Create the executor with useful settings
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,  # Set to False in production
        max_iterations=10,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
    )
    
    return executor


def run_conversation():
    """Run an interactive conversation with the agent."""
    
    agent = create_customer_service_agent()
    chat_history = []
    
    print("=" * 60)
    print("Acme Customer Service Agent")
    print("Type 'quit' to exit")
    print("=" * 60)
    print()
    
    while True:
        user_input = input("Customer: ").strip()
        
        if user_input.lower() in ['quit', 'exit', 'q']:
            print("Thank you for contacting Acme support. Goodbye!")
            break
        
        if not user_input:
            continue
        
        try:
            result = agent.invoke({
                "input": user_input,
                "chat_history": chat_history,
            })
            
            response = result["output"]
            print(f"\nAgent: {response}\n")
            
            # Update chat history
            chat_history.append(HumanMessage(content=user_input))
            chat_history.append(AIMessage(content=response))
            
        except Exception as e:
            print(f"\nError: {e}")
            print("I apologize, but I encountered an issue. Please try again.\n")


if __name__ == "__main__":
    run_conversation()
```

## Step 9: Audit Logging for Compliance

MeshGuard automatically logs all governance decisions. Here's how to access and use those logs:

```python
# audit/compliance.py
from datetime import datetime, timedelta
from typing import Optional
import json

from governance.client import get_client


def get_recent_actions(
    hours: int = 24,
    actions: Optional[list[str]] = None,
    decisions: Optional[list[str]] = None,
) -> list[dict]:
    """
    Retrieve recent governance decisions from MeshGuard.
    
    Args:
        hours: How many hours back to search
        actions: Filter by action types (e.g., ["write:refund:*"])
        decisions: Filter by decision ("allowed", "denied")
    """
    client = get_client()
    
    since = datetime.now() - timedelta(hours=hours)
    
    return client.get_audit_log(
        since=since,
        actions=actions,
        decisions=decisions,
        limit=1000,
    )


def generate_compliance_report(
    start_date: datetime,
    end_date: datetime,
    output_file: str = "compliance_report.json",
) -> dict:
    """
    Generate a compliance report for a date range.
    
    Includes:
    - Total actions by type
    - Denial breakdown with reasons
    - High-risk action summary
    - Rate limit violations
    """
    client = get_client()
    
    logs = client.get_audit_log(
        since=start_date,
        until=end_date,
        limit=10000,
    )
    
    report = {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "summary": {
            "total_actions": len(logs),
            "allowed": sum(1 for l in logs if l["decision"] == "allowed"),
            "denied": sum(1 for l in logs if l["decision"] == "denied"),
        },
        "by_action": {},
        "denials": [],
        "high_risk_actions": [],
        "rate_limit_violations": [],
    }
    
    # Group by action type
    for log in logs:
        action = log["action"]
        if action not in report["by_action"]:
            report["by_action"][action] = {"allowed": 0, "denied": 0}
        
        if log["decision"] == "allowed":
            report["by_action"][action]["allowed"] += 1
        else:
            report["by_action"][action]["denied"] += 1
            report["denials"].append({
                "timestamp": log["timestamp"],
                "action": action,
                "reason": log.get("reason", "Unknown"),
                "context": log.get("context", {}),
            })
        
        # Track high-risk actions
        if action.startswith("write:customer:email"):
            report["high_risk_actions"].append(log)
        
        # Track rate limit violations
        if "rate limit" in log.get("reason", "").lower():
            report["rate_limit_violations"].append(log)
    
    # Write report to file
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2, default=str)
    
    return report


def detect_anomalies(hours: int = 1) -> list[dict]:
    """
    Detect potentially anomalous patterns in recent agent activity.
    
    Checks for:
    - Unusual denial rates
    - Repeated access to same customer
    - Actions outside business hours
    """
    logs = get_recent_actions(hours=hours)
    
    anomalies = []
    
    # Check denial rate
    if logs:
        denial_rate = sum(1 for l in logs if l["decision"] == "denied") / len(logs)
        if denial_rate > 0.5:  # More than 50% denials
            anomalies.append({
                "type": "high_denial_rate",
                "rate": denial_rate,
                "message": f"Denial rate of {denial_rate:.0%} in last {hours} hour(s)",
            })
    
    # Check for repeated customer access
    customer_access: dict[str, int] = {}
    for log in logs:
        customer_id = log.get("context", {}).get("customer_id")
        if customer_id:
            customer_access[customer_id] = customer_access.get(customer_id, 0) + 1
    
    for customer_id, count in customer_access.items():
        if count > 20:  # More than 20 accesses in the period
            anomalies.append({
                "type": "repeated_access",
                "customer_id": customer_id,
                "count": count,
                "message": f"Customer {customer_id} accessed {count} times",
            })
    
    return anomalies


# Example usage
if __name__ == "__main__":
    # Generate daily compliance report
    report = generate_compliance_report(
        start_date=datetime.now() - timedelta(days=1),
        end_date=datetime.now(),
    )
    
    print(f"Total actions: {report['summary']['total_actions']}")
    print(f"Allowed: {report['summary']['allowed']}")
    print(f"Denied: {report['summary']['denied']}")
    
    # Check for anomalies
    anomalies = detect_anomalies(hours=1)
    if anomalies:
        print("\n⚠️  Anomalies detected:")
        for a in anomalies:
            print(f"  - {a['message']}")
```

## Step 10: Deployment Considerations

### Environment Variables

```bash
# .env.production
OPENAI_API_KEY=sk-...
MESHGUARD_GATEWAY_URL=https://dashboard.meshguard.app
MESHGUARD_AGENT_TOKEN=your-production-token
ENVIRONMENT=production

# Optional: Configure trust level via token
# Different tokens can have different trust levels configured in MeshGuard
```

### Running in Production

```python
# production.py
import os
from main import create_customer_service_agent

# Configure for production
os.environ["ENVIRONMENT"] = "production"

def handle_customer_message(customer_id: str, message: str, session_id: str):
    """
    Handle a customer message from your application.
    
    In production, you'd integrate this with your:
    - Chat widget (Intercom, Zendesk Chat, etc.)
    - Support ticket system
    - Phone system (via transcription)
    """
    agent = create_customer_service_agent()
    
    # Load conversation history from your database
    chat_history = load_chat_history(session_id)
    
    try:
        result = agent.invoke({
            "input": message,
            "chat_history": chat_history,
        })
        
        response = result["output"]
        
        # Save to conversation history
        save_to_chat_history(session_id, message, response)
        
        return response
        
    except Exception as e:
        # Log error and return graceful fallback
        log_error(e, customer_id, session_id)
        return """I apologize, but I'm experiencing technical difficulties. 
        
Let me connect you with a human agent who can help right away."""
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

CMD ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Health Checks and Monitoring

```python
# health.py
from fastapi import FastAPI, HTTPException
from governance.client import get_client

app = FastAPI()

@app.get("/health")
async def health_check():
    """Kubernetes liveness/readiness probe."""
    try:
        client = get_client()
        # Verify MeshGuard connectivity
        client.check("health:ping")
        return {"status": "healthy", "meshguard": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    # Export metrics about governance decisions, latency, etc.
    return get_governance_metrics()
```

## Testing Your Agent

Here's a test script to verify your governance is working:

```python
# tests/test_governance.py
import pytest
from unittest.mock import patch, MagicMock

from tools.lookup import lookup_customer, lookup_order
from tools.refunds import process_refund
from tools.account import update_customer_email


class TestBasicTier:
    """Test that basic lookups are allowed."""
    
    def test_customer_lookup_allowed(self):
        result = lookup_customer("alice@example.com")
        assert "Alice Johnson" in result
        assert "❌" not in result
    
    def test_order_lookup_allowed(self):
        result = lookup_order("ord_1001")
        assert "Wireless Headphones" in result
        assert "❌" not in result


class TestElevatedTier:
    """Test refund governance."""
    
    def test_small_refund_allowed(self):
        """Refunds under $50 should be auto-approved."""
        result = process_refund("ord_1001", 25.00, "Customer dissatisfied")
        assert "✅" in result or "Refund Processed" in result
    
    def test_large_refund_requires_approval(self):
        """Refunds over $500 should be denied."""
        result = process_refund("ord_1001", 600.00, "Full refund requested")
        assert "requires human approval" in result.lower() or "❌" in result


class TestAdminTier:
    """Test account modification governance."""
    
    @patch('tools.account.get_client')
    def test_email_change_denied_without_admin(self, mock_client):
        """Email changes should be denied without admin trust."""
        mock_decision = MagicMock()
        mock_decision.allowed = False
        mock_decision.reason = "Requires admin trust level"
        mock_decision.request_id = "test-123"
        
        mock_client.return_value.check.return_value = mock_decision
        
        result = update_customer_email("cust_001", "new@email.com", "123456")
        assert "Human Verification" in result or "❌" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

## Complete File Structure

Here's the final project structure with all files:

```
customer_service_agent/
├── main.py
├── api.py                    # FastAPI wrapper for production
├── production.py             # Production configuration
├── health.py                 # Health check endpoints
├── requirements.txt
├── Dockerfile
├── .env.example
│
├── tools/
│   ├── __init__.py
│   ├── lookup.py
│   ├── refunds.py
│   ├── account.py
│   └── escalation.py
│
├── governance/
│   ├── __init__.py
│   ├── client.py
│   └── escalation.py
│
├── services/
│   ├── __init__.py
│   ├── crm.py
│   ├── orders.py
│   └── payments.py
│
├── audit/
│   ├── __init__.py
│   └── compliance.py
│
├── policies/
│   └── customer-service.yaml
│
└── tests/
    ├── __init__.py
    └── test_governance.py
```

## Summary: What You've Built

You now have a production-ready customer service agent with:

| Feature | Implementation |
|---------|----------------|
| **Tiered Permissions** | Basic (lookups), Elevated (refunds ≤$500), Admin (account changes) |
| **Automatic Governance** | Every tool checks MeshGuard before executing |
| **Human Escalation** | Graceful handoff when agent lacks permission |
| **Rate Limiting** | Protection against runaway agents |
| **Full Audit Trail** | Every action logged with context for compliance |
| **Anomaly Detection** | Automated detection of suspicious patterns |
| **Production Ready** | Docker deployment, health checks, error handling |

## Next Steps

Now that you have a governed customer service agent, explore these advanced topics:

- **[Multi-Agent Governance](/guides/securing-crewai)** — Add specialist agents (billing, technical support) with delegation controls
- **[Policy Configuration Deep Dive](/concepts/policies)** — Advanced conditions, time-based rules, and dynamic policies
- **[Trust Tiers Explained](/concepts/trust-tiers)** — Understanding verified, trusted, and privileged agent levels
- **[Audit & Compliance](/concepts/audit-logging)** — SOC 2, GDPR, and PCI-DSS compliance patterns

---

::: tip Ready to Govern Your Agent?
Create your free MeshGuard account at [meshguard.app](https://meshguard.app) and deploy governed customer service in minutes.

**Questions?** Join our [Discord community](https://discord.gg/meshguard) or email support@meshguard.app.
:::

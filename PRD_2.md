# NYC Coffee — AI Voice Cashier
## Product Requirements Document

---

## 1. Overview

NYC Coffee is a busy coffee shop at 512 West 43rd Street, New York, NY (Tel: 212-535-7367). We are building an AI-powered voice cashier web application that serves three user groups:

1. **Customers** — place orders via voice or text conversation with an AI cashier
2. **Baristas** — view and manage incoming order tickets
3. **Store Owner** — view daily business performance metrics

The app is a single deployed web application with three distinct views, all connected to a shared Supabase database.

---
## 2. Jobs To Be Done (JTBD)

### Customer
I'm a busy New Yorker on the go, and I need an easy, frictionless, and efficient way to order coffee. I want the experience to feel as natural as ordering from a human cashier — but even more effortless. If I misspeak, change my mind, or the AI misunderstands me, I want it to be easy to correct without starting over. I shouldn't have to think about how the system works; I just say what I want and get my coffee.

### Barista
I'm a barista working a fast-paced shift, often managing multiple drinks at once. I need incoming orders to be instantly scannable — the drink name, size, temperature, milk, and modifications all visible at a glance without clicking into anything. I don't want to interpret ambiguous instructions or hunt for details. Every second I spend reading a ticket is a second I'm not making drinks. This interface should work even in my peripheral vision.

### Coffee Shop Owner
I'm a small business owner making daily and weekly decisions about staffing, inventory, and my menu. I need a clear snapshot of how the business is performing — not just totals, but patterns. Which items are selling and which aren't? When are my peak hours so I know whether to schedule an extra barista on Tuesdays? Are customers consistently choosing add-ons that signal a menu opportunity? I don't need complex analytics — I need actionable insights I can act on this week.


## 3. Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Framework | Next.js (App Router) | React-based, deploys easily to Vercel |
| Database | Supabase (PostgreSQL) | Free tier. Stores all order data persistently. |
| LLM | Anthropic Claude API (claude-sonnet-4-20250514) | Powers the AI cashier's conversational logic |
| Speech-to-Text | Web Speech API (browser-native) | Free. `window.SpeechRecognition`. Chrome/Edge support. |
| Text-to-Speech | Web Speech API (browser-native) | Free. `window.speechSynthesis`. Fallback for unsupported browsers. |
| Hosting | Vercel | Free tier. Auto-deploys from GitHub. |
| Styling | Tailwind CSS | Utility-first CSS framework |

---

## 4. Database Schema

### `orders` table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated unique order ID |
| order_number | serial | Human-readable order number (e.g., #001), resets daily |
| items | jsonb | Array of order items (see Item Schema below) |
| subtotal | decimal | Pre-tax total |
| tax | decimal | NYC sales tax (8.875%) |
| total | decimal | Final total |
| status | text | `new` → `in_progress` → `completed` |
| created_at | timestamptz | When the order was placed |
| completed_at | timestamptz | When barista marked it complete (nullable) |

### Item Schema (inside `items` JSONB)

```json
{
  "name": "Latte",
  "category": "coffee",
  "size": "large",
  "temperature": "iced",
  "milk": "oat milk",
  "sweetness": "less sugar",
  "ice": "normal",
  "add_ons": ["extra espresso shot"],
  "quantity": 1,
  "base_price": 5.00,
  "add_on_price": 1.50,
  "item_total": 6.50
}
```

---

## 5. Complete Menu Data

The AI cashier MUST use this exact menu for pricing and availability. All prices are in USD.

### Coffee

| Item | Small (12oz) | Large (16oz) | Available Temps |
|------|-------------|-------------|-----------------|
| Americano | $3.00 | $4.00 | Hot, Iced |
| Latte | $4.00 | $5.00 | Hot, Iced |
| Cold Brew | $4.00 | $5.00 | **Iced only** |
| Mocha | $4.50 | $5.50 | Hot, Iced |
| Coffee Frappuccino | $5.50 | $6.00 | **Iced only (blended)** |

### Tea

| Item | Small (12oz) | Large (16oz) | Available Temps |
|------|-------------|-------------|-----------------|
| Black Tea | $3.00 | $3.75 | Hot, Iced |
| Jasmine Tea | $3.00 | $3.75 | Hot, Iced |
| Lemon Green Tea | $3.50 | $4.25 | Hot, Iced |
| Matcha Latte | $4.50 | $5.25 | Hot, Iced |

### Add-Ons / Substitutions

| Add-On | Price |
|--------|-------|
| Whole Milk | $0.00 (default) |
| Skim Milk | $0.00 |
| Oat Milk | $0.50 |
| Almond Milk | $0.75 |
| Extra Espresso Shot | $1.50 |
| Extra Matcha Shot | $1.50 |
| 1 Pump Caramel Syrup | $0.50 |
| 1 Pump Hazelnut Syrup | $0.50 |

### Pastries

| Item | Price |
|------|-------|
| Plain Croissant | $3.50 |
| Chocolate Croissant | $4.00 |
| Chocolate Chip Cookie | $2.50 |
| Banana Bread (Slice) | $3.00 |

### Customization Options

| Category | Options |
|----------|---------|
| Sweetness | No Sugar, Less Sugar, Normal (default), Extra Sugar |
| Ice Level | No Ice, Less Ice, Normal (default), Extra Ice |
| Size | Small (12oz), Large (16oz) — default to Small if not specified |

---

## 6. Feature Requirements

### 6A. Customer View — Conversational Ordering + Receipt

**URL path:** `/` (home page)

**UI Layout:**
- Chat interface centered on screen, mobile-friendly
- Toggle switch at top: 🎤 Voice / ⌨️ Text mode
- Chat bubbles: AI on the left, customer on the right
- Text input field at bottom with send button
- Microphone button (pulsing animation when listening) in voice mode
- When order is confirmed, a styled receipt card appears in the chat

**Conversational Flow:**

1. **Greeting** — AI introduces itself warmly. Example: *"Hey there! Welcome to NYC Coffee. What can I get started for you?"*
2. **Order taking** — Customer states what they want. AI extracts items and asks clarifying questions for any missing details.
3. **Clarifying questions** — AI asks about size, temperature, milk preference, sweetness, ice level ONLY for attributes the customer didn't specify. Don't ask about every single option if the customer already said "large iced oat milk latte." Aim to get the order submitted in as little back and forth as possible while still gathering all the information needed. 
4. **Modifications** — Customer can say things like "actually make that a large" or "add an extra shot" or "switch to almond milk." AI confirms the change.
5. **Multi-item orders** — After confirming one item, AI asks "Anything else?" Customer can add more items.
6. **Order confirmation** — When customer says they're done, AI reads back the full order with prices and asks for confirmation.
7. **Receipt** — After confirmation, display a styled receipt card in the chat with:
   - Order number
   - All items with customizations and individual prices
   - Subtotal
   - Tax (8.875%)
   - Total
   - Timestamp
   - Order pick up ETA

**AI Personality:**
- Friendly, efficient NYC coffee shop energy — not overly chatty
- Uses casual but professional language
- Keeps responses concise (this is a busy shop)
- Can handle typical NYC customer shorthand and natural language: "gimme a large iced latte with oat" → understands this perfectly

**Voice Mode Behavior:**
- Tap mic to start recording, tap again (or auto-stop on silence) to stop
- Transcribed text appears in chat as the customer's message
- AI response is read aloud via text-to-speech AND displayed as text
- Visual indicator while AI is "speaking"

**Text Mode Behavior:**
- Standard chat input with send button
- No TTS playback (silent)

### 6B. Barista View — Order Ticket Queue

**URL path:** `/barista`

**UI Layout:**
- Clean, high-contrast interface optimized for quick scanning during a busy shift
- Three columns or sections:
  - **New Orders** (left) — freshly placed, not yet started
  - **In Progress** (middle) — barista has started making it
  - **Completed** (right) — done, ready for pickup
- Each ticket card shows:
  - Order number (large, prominent)
  - Time since order was placed (e.g., "2 min ago")
  - List of items with ALL customizations clearly displayed
  - Temperature, size, milk, sweetness, ice, add-ons — all visible at a glance
- Action buttons:
  - "Start" → moves from New to In Progress
  - "Complete" → moves from In Progress to Completed
- **Real-time updates**: New orders appear automatically without page refresh (use Supabase real-time subscriptions or polling every 5 seconds)
- Audio notification chime when a new order arrives

### 6C. Owner View — Data Dashboard (UPDATED)

**URL path:** `/dashboard`

**UI Layout:**
- Clean dashboard with card-based metrics layout
- Date filter at top: Today, Last 7 Days, Last 30 Days, Custom Range
- Comparison toggle: "vs. prior period" (e.g., this week vs. last week) where applicable
- Responsive grid — KPI cards across the top, charts below
- Mobile-friendly but optimized for desktop/tablet (owner likely checks this on a laptop or iPad)

---

**Metric 1: Revenue + Order Volume Trend**
*Category: Business Health*
*Format: Dual-axis line chart (revenue on left axis, order count on right axis)*

- Shows daily revenue and number of orders over the selected time period
- Allows the owner to spot trends and correlate volume with revenue
- If revenue drops but order count stays flat, the issue is likely AOV (customers ordering cheaper items). If both drop, it's a traffic problem.
- Toggle between daily and weekly aggregation

**Why it matters:** This is the anchor chart. Every other metric on the dashboard helps explain *why* this line is going up or down.

---

**Metric 2: Average Order Value (AOV)**
*Category: Business Health*
*Format: KPI card with trend arrow*

- Total revenue ÷ total orders for the selected period
- Show as a large number (e.g., "$7.42") with a green/red arrow and percentage change vs. prior period
- Below the number, show a subtle sparkline of AOV over the last 7 or 30 days

**Why it matters:** AOV tells the owner if customers are spending more or less per visit. A declining AOV might mean a popular high-margin add-on went out of stock, or customers are shifting away from large sizes. It directly informs upsell and promotion strategies.

---

**Metric 3: Top 5 Items by Revenue**
*Category: Inventory & Menu Decisions*
*Format: Horizontal bar chart, ranked by revenue (not order count)*

- Shows the 5 highest-revenue items for the selected period
- Each bar displays: item name, total revenue, and number of times ordered
- Ranked by revenue because a $6 frappuccino ordered 20 times ($120) matters more than a $2.50 cookie ordered 30 times ($75)

**Why it matters:** Informs inventory purchasing — always keep these items well-stocked. Also identifies what to feature in promotions or signage. If a high-margin item is just outside the top 5, a small promotion could push it up. Conversely, if a menu item never appears here, the owner might consider dropping it.

---

**Metric 4: Add-On Attach Rate**
*Category: Inventory & Menu Decisions*
*Format: KPI card (overall rate) + small ranked list of top add-ons*

- **Attach rate**: percentage of orders that include at least one paid add-on (e.g., "62% of orders include an add-on")
- **Top add-ons list**: ranked by frequency, showing the add-on name and how many times it was ordered (e.g., "Oat Milk — 143 orders, Extra Espresso Shot — 87 orders")
- Only show paid add-ons (exclude whole milk and skim milk which are free)

**Why it matters:** High-frequency add-ons reveal customer preferences that should influence inventory and possibly menu design. If nearly half of all customers are paying $0.50 extra for oat milk, the owner might consider making it a default option, negotiating a better wholesale price, or running a promotion around it. Low-performing add-ons (e.g., hazelnut syrup almost never ordered) might not be worth stocking.

---

**Metric 5: Orders by Hour**
*Category: Staffing & Operations*
*Format: Vertical bar chart, 24-hour x-axis (or operating hours only)*

- Shows the number of orders placed in each hour of the day
- Aggregated across the selected time period (e.g., average orders per hour over the last 7 days)
- Highlight the peak hour with a distinct color or label

**Why it matters:** This is the single most actionable chart for staffing decisions. If there's a clear rush from 7-10am and a dead zone from 2-4pm, the owner knows to schedule an extra barista for mornings and can potentially reduce afternoon staffing. It also informs when to run promotions — a "2pm happy hour" discount could smooth out the dead zone.

---

**Metric 6: Average Fulfillment Time**
*Category: Operational Efficiency*
*Format: KPI card with trend arrow*

- Average time from order placed (`created_at`) to order completed (`completed_at`) for the selected period
- Displayed in minutes and seconds (e.g., "4m 32s")
- Trend arrow comparing to prior period
- Optionally: show a small breakdown of peak hours vs. off-peak fulfillment time if data supports it

**Why it matters:** Rising fulfillment times signal operational problems — maybe the shop is understaffed during peak hours, a new barista needs more training, or a popular drink is too complex to make quickly. This metric paired with Orders by Hour helps the owner pinpoint exactly *when* the shop is struggling.

---

**Metric 7: Issue Rate (Cancellations + Remakes)**
*Category: Operational Efficiency*
*Format: Two small KPI cards side by side*

- **Cancellation Rate**: number of cancelled orders ÷ total orders, shown as a percentage. Below it, show the top cancellation reason (e.g., "Most common: Item unavailable")
- **Remake Rate**: number of remake orders ÷ total completed orders, shown as a percentage. Below it, show the top remake reason (e.g., "Most common: Wrong drink made")
- Both show trend arrows vs. prior period

**Why it matters:** These are low-frequency but high-signal metrics. A spike in remakes might mean a new barista needs training or the ticket display isn't clear enough. A spike in "item unavailable" cancellations means the inventory ordering process needs attention. The owner doesn't need to look at these daily, but when something goes wrong, these metrics tell the story.

---

**Dashboard Layout Summary (top to bottom):**

| Row | Contents |
|-----|----------|
| 1 (KPI cards) | AOV (with trend) · Avg Fulfillment Time (with trend) · Cancellation Rate · Remake Rate |
| 2 (Primary chart) | Revenue + Order Volume Trend (full width) |
| 3 (Two charts) | Top 5 Items by Revenue (left) · Orders by Hour (right) |
| 4 (Bottom) | Add-On Attach Rate + Top Add-Ons List |

This layout puts the quick-glance health check at the top (KPI cards), the big-picture trend in the middle, and the detailed breakdowns at the bottom — matching how an owner would naturally scan the page.

## 7. Business Rules & Edge Cases

These are CRITICAL for the AI cashier to handle correctly. The AI must enforce these rules during conversation.

### Menu Enforcement
- Only items on the menu can be ordered. If a customer asks for something not on the menu (e.g., "can I get a smoothie?"), politely say it's not available and suggest alternatives.
- All prices must match the menu exactly.

### Temperature Rules
- **Cold Brew** → Iced ONLY. If customer asks for "hot cold brew," explain it's only available iced and suggest a hot Americano or Latte instead.
- **Coffee Frappuccino** → Iced/blended ONLY. Cannot be made hot. If asked, explain and suggest a Mocha or Latte instead.
- **All other drinks** → available hot or iced.

### Espresso / Shot Rules
- **Maximum 3 extra espresso shots** per drink. If someone asks for more, politely decline ("That's a lot of caffeine! We cap it at 3 extra shots for safety.").
- **"Latte with no espresso"** → Reject this. A latte without espresso is just steamed milk, not a menu item. Say something like "A latte without espresso would just be steamed milk — can I get you a regular latte instead?"
- **Extra matcha shots** only apply to Matcha Latte. Don't allow adding matcha to non-matcha drinks (e.g., "add matcha to my Americano" → reject).
- **Extra espresso shots** can be added to any coffee drink but NOT to teas (except Matcha Latte, which already has caffeine — use judgment).
- **Cannot support decaf orders** per the menu, decaf options arenot available. If customer tries to order decaf coffee, suggest lower caffeine options. Say something like "We unfortunately do not have decaf, can I get you a lower caffeiene drink such as a Jasmine green tea?" ONLY say this if the customer has not already ordered this beverage. 

### Milk Rules
- **Default milk is Whole Milk** ($0.00). Only charge for Oat ($0.50) or Almond ($0.75).
- Milk substitutions apply to drinks that contain milk: Latte, Mocha, Matcha Latte, Coffee Frappuccino.
- **Americano, Cold Brew, Black Tea, Jasmine Tea, Lemon Green Tea** — these don't come with milk by default. If customer asks to add milk, treat it as an add-on.
- Don't allow multiple milk types in one drink.

### Sweetness & Ice Rules
- Sweetness and Ice levels are customizations, not add-ons (no extra charge).
- **Ice level only applies to iced drinks.** Don't ask about ice level for hot drinks.
- **Sweetness applies to all drinks.**

### Syrup Rules
- Customers can add multiple pumps of syrup. Each pump is $0.50 regardless of flavor. 
- Reasonable max: 6 pumps total across all flavors. Beyond that, politely suggest that's quite sweet. 

### Pastry Rules
- The only customization options for pastries are them to be heated up (no size, milk, sweetness etc. changes)
- Pastries can be ordered alongside drinks or on their own.
- If a customer ONLY orders pastries and nothing to drink, that's totally fine.

### Quantity Rules
- Customers can order multiple of the same item: "two large iced lattes with oat milk."
- Reasonable maximum per menu item: 12. If someone tries to order 50 lattes, politely ask if this is a catering order and explain we can't process bulk orders through this system.

### General Edge Cases
- **Nonsensical requests**: "Can I get a latte with no coffee, no milk, and no water?" → Politely redirect.
- **Off-menu requests**: "Can I get avocado toast?" → "Sorry, we don't have that on our menu! We do have some great pastries though — want to hear the options?"
- **Allergies / dietary questions**: "Is the oat milk gluten-free?" → "I'd recommend checking with our staff about specific allergen information. I can help you place your order though!"
- **Non-order conversation**: "What's the weather like?" → Gently redirect: "I'm not sure about the weather, but I can help you order a drink! What sounds good?"
- **Changing their mind**: Customer should be able to modify or remove items before confirming the final order. Once they confirm the order, it cannot be canceled.
- **Empty order**: If customer says "that's it" but hasn't ordered anything, ask if they'd like to order something.

---

## 8. AI System Prompt (for Claude API)

The following system prompt should be sent with every API call to Claude. This is the core logic that controls the cashier's behavior:

```
You are the AI cashier at NYC Coffee, a busy coffee shop in New York City.

Your job is to take customer orders through natural conversation. Be friendly, efficient, and casual — like a real NYC barista. Keep responses concise.

MENU AND PRICING:
[Insert full menu data from Section 4 above]

RULES YOU MUST FOLLOW:
[Insert all business rules from Section 6 above]

CONVERSATION BEHAVIOR:
- Greet the customer warmly but briefly
- Take their order and ask clarifying questions ONLY for details they didn't provide
- Default to: Small size, Whole Milk, Normal sweetness, Normal ice (for iced drinks)
- After each item, ask "Anything else?"
- When the customer is done, read back the full order with prices
- After confirmation, output the order in the following JSON format wrapped in ```order``` tags:

```order
{
  "items": [
    {
      "name": "Latte",
      "category": "coffee",
      "size": "large",
      "temperature": "iced",
      "milk": "oat milk",
      "sweetness": "normal",
      "ice": "normal",
      "add_ons": ["extra espresso shot"],
      "quantity": 1,
      "base_price": 5.00,
      "add_on_price": 1.50,
      "item_total": 6.50
    }
  ],
  "subtotal": 6.50,
  "tax": 0.58,
  "total": 7.08
}
```

IMPORTANT: Only output the JSON when the customer has confirmed their complete order. During conversation, just chat normally.
```

---

## 9. Orders CSV Export

The project requires an `orders.csv` file in the GitHub repo showing sample data structure. Generate this from Supabase data or create sample data with this structure:

```csv
order_id,order_number,item_name,category,size,temperature,milk,sweetness,ice,add_ons,quantity,item_total,order_subtotal,tax,order_total,status,created_at,completed_at
uuid-1,001,Latte,coffee,large,iced,oat milk,normal,normal,"extra espresso shot",1,6.50,6.50,0.58,7.08,completed,2025-02-20T08:30:00Z,2025-02-20T08:35:00Z
uuid-2,002,Americano,coffee,small,hot,none,no sugar,n/a,"",1,3.00,6.50,0.58,7.08,completed,2025-02-20T09:15:00Z,2025-02-20T09:18:00Z
uuid-2,002,Chocolate Croissant,pastry,n/a,n/a,n/a,n/a,n/a,"",1,4.00,6.50,0.58,7.08,completed,2025-02-20T09:15:00Z,2025-02-20T09:18:00Z
```

Note: Each row is one item. Orders with multiple items have multiple rows sharing the same order_id and order_number.

---

## 10. App Navigation

Simple top navigation bar or sidebar with three links:
- **Order** → `/` (Customer View)
- **Barista** → `/barista` (Barista View)
- **Dashboard** → `/dashboard` (Owner View)

In a real product, Barista and Dashboard views would be behind authentication. For this project, all views are publicly accessible.

---

## 11. Non-Requirements (Out of Scope)

- Payment processing (stated in prompt)
- User authentication / accounts
- Order modification after placement
- Kitchen display system
- Inventory management
- Loyalty / rewards program
- Multiple store locations
- Mobile native app (web only)

---

## 12. Build Order (Recommended Sequence)

1. **Set up project scaffolding** — Next.js + Tailwind + Supabase connection
2. **Create database tables** in Supabase
3. **Build Customer View** — chat UI first (text only), then add AI ordering logic, then add voice
4. **Build Barista View** — read from same orders table, ticket cards, status updates
5. **Build Owner Dashboard** — query order data, render charts (use Recharts or Chart.js)
6. **Polish & test edge cases** — run through all the business rules
7. **Generate sample data** — place ~20 test orders, export CSV
8. **Deploy to Vercel** — connect GitHub repo, add env vars

---

## 13. Environment Variables Needed

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

These go in `.env.local` for local development and in Vercel's Environment Variables settings for production. NEVER commit these to GitHub — add `.env.local` to `.gitignore`.

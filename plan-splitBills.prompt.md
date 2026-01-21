## Plan: Frontend Pages Implementation

We will implement the user interface using **Next.js App Router** and **Tailwind CSS**. The app will consist of three main route groups: Authentication, Group Management, and Group Dashboard.

### Steps

1.  **Landing & Authentication Page** ([app/page.tsx](app/page.tsx))
    *   **Function**: Serves as the entry point. checks if the user is already logged in (redirects to `/groups`).
    *   **UI**: A centered card layout with tabs for **Login** and **Register**.
    *   **Forms**:
        *   *Register*: Name, Email, Password. Submit to `/api/auth/register`.
        *   *Login*: Email, Password. Submit to `/api/auth/login`.

2.  **Groups Listing Page** ([app/groups/page.tsx](app/groups/page.tsx))
    *   **Function**: Lists all groups the user belongs to and allows creating new ones.
    *   **UI**: Grid of cards showing Group Name and basic status.
    *   **Action**: "Create Group" button that opens a modal/form to POST to `/api/groups`.
    *   **Interaction**: Clicking a group card navigates to `/groups/[id]`.

3.  **Group Dashboard** ([app/groups/[id]/page.tsx](app/groups/[id]/page.tsx))
    *   **Function**: The main workspace for a specific group.
    *   **Structure**:
        *   **Header**: Group name, currency, and "Invite Member" button.
        *   **Overview Cards**: User's own net balance (You owe / You are owed).
        *   **Tabs**: To switch between **Expenses**, **Balances/Members**, and **Settlements**.
    *   **Key Actions**: Floated or prominent buttons for "Add Expense" and "Record Payment".

4.  **Group Components** (`app/groups/[id]/_components/`)
    *   **Add Expense Modal**: A form handling split logic (Equal/Unequal/Shares) and optional Itemized entry. Posts to `/api/groups/[id]/expenses`.
    *   **Settlement View**: Fetches and displays recommended transfers from `/api/groups/[id]/settlements`. Includes a "Settle" button to quickly record a payment.
    *   **Activity Log**: (Optional) Lists recent expenses and payments mixed together.

### Further Considerations
1.  **State Management**: Since we are using App Router, we will use Server Components for fetching initial data (Group details) and Client Components for interactive elements (Modals, Forms).
2.  **Route Protection**: We should ensure middleware or layout checks exist to redirect unauthenticated users from `/groups/*` back to `/`.
3.  **Notifications**: Simple toast notifications for success/error states (e.g., "Expense Added", "Login Failed").

graph TD
    A[Appraisal Report Page] --> B[Header: Identity & FY]
    A --> C[Key Performance Dashboard]
    A --> D[Monthly Growth Chart]
    A --> E[AI Analysis Section]
    A --> F[Achievement Badges]
    A --> G[Competency Breakdown]
    A --> H[Formal Sign-off]

    subgraph B [Header Section]
        B1[Employee Profile Pic]
        B2[Name & Designation]
        B3[Department & Join Date]
        B4[Overall Rating Badge]
    end

    subgraph C [Performance Dashboard]
        C1[Annual Total Score]
        C2[Avg Monthly Score]
        C3[Average Completion %]
        C4[Annual Rank]
    end

    subgraph D [Monthly Trends]
        D1[Score Bar Chart]
        D2[Completion Rate Line]
        D3[Peak Month Indicator]
    end

    subgraph E [AI Analysis]
        E1[Performance Narrative]
        E2[Core Strengths List]
        E3[Growth Opportunities]
        E4[Development Roadmap]
    end

    subgraph F [Recognition]
        F1[Perfect Month Badge]
        F2[Consistent Performer Badge]
        F3[Most Improved Badge]
    end

    subgraph G [Category Breakdown]
        G1[Category Scores: SEO/Content/etc]
        G2[Priority Distribution]
    end

    subgraph H [Sign-off]
        H1[Manager Signature Line]
        H2[Employee Signature Line]
        H3[Approval Date]
    end

%% Implementation Strategy (How to Show) %%
%% 0. DATA FETCHING: Ensure profile data (avatar_url, full_name, designation) is fetched from the 'profiles' table via Supabase for real-time accuracy.
%% 1. VISUALS: Use Lucide React icons for section titles (e.g. Sparkles for AI, Trophy for Badges).
%% 2. STYLING: Use Tailwind CSS with a focus on 'print' modifiers for physical report generation.
%% 3. CHARTS: Use a bar chart for scores and a line overlay for completion percentages to show trend.
%% 4. AI UI: Narrative text should be in a subtly colored box (e.g. purple-50/blue-50) with high readability.
%% 5. BADGES: High-quality emoji or SVG icons with tooltips explaining the earning criteria.
%% 6. PDF: Ensure the page uses 'break-inside-avoid' for sections so no section is cut between pages.
%% 7. NAV: Sticky header (screen only) with 'Print Report' and 'Download CSV' actions.

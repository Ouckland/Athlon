The limitations are as follows:

Live matches
    Match events are currently entered by a trusted Scout or Admin. There is no automatic live-score provider yet.

    The MVP only supports the core events: goals, cards, substitutions, half-time, and full-time.

    Correcting a mistake in a match event is still basic. There isn't a full event correction/audit interface yet.

    We don't have advanced football stats such as possession, shots, xG, passes, tackles, etc.

    There are no advanced player ratings yet.

Realtime

    Realtime currently uses an in-memory channel layer, which is fine for local/MVP use but would need Redis or another shared channel layer for a proper multi-process production deployment.

    WebSocket reconnect/recovery is basic. A more robust system for reconnecting and catching up on missed events can come later.

Fantasy scoring
    Player minutes aren't tracked precisely yet. The 60+ minute bonus is estimated from the available match events.

    Clean-sheet scoring is simplified and doesn't fully account for exactly how long a player was on the pitch.

    Assists aren't supported yet because match events don't currently carry explicit assist information.

    Fantasy points are recalculated after match events. That's perfectly reasonable for the MVP, but incremental scoring would be more efficient at larger scale.
    
    The scoring system is intentionally simpler than mature fantasy platforms.

Fantasy structure
    Fantasy teams aren't currently tied to a specific competition, season, or gameweek.

    Player selection isn't restricted to a particular competition yet.

    There are no transfers, player prices, budgets, formations, chips, or boosts.
    There isn't a gameweek system yet.

Fantasy groups
    Groups currently use invite codes. More advanced invitation/management features can come later.

    Group management is basic; things like removing members or transferring ownership aren't implemented.

    Group responses currently expose member email addresses. Eventually, this should use display names/profile information instead.

API
    Leaderboards aren't paginated yet.
    
    The API contract is being documented now for the React developer.
    Some queries will eventually need optimization once Athlon has real-world data volume.

Production
    Production realtime infrastructure still needs Redis/shared Channels infrastructure.

    SQLite needs to be replaced with a production database.

    Production deployment configuration still needs to be finalized.

    Monitoring, error tracking, and more comprehensive logging haven't been added yet.

    Background task processing isn't needed for the MVP but may become useful later.

    Product

    Notifications aren't part of the MVP.

    Social features/comments aren't included.

    Advanced player profiles and statistics aren't included.

    Automated match event detection/computer vision isn't included.

    Direct integration with professional football data providers isn't included.
from django.contrib import admin

from .models import (
    FantasyGroup,
    FantasyGroupMembership,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
    FantasyPlayerPrice,
)


@admin.register(FantasyTeam)
class FantasyTeamAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "user", "starting_budget", "created_at")
    search_fields = ("name", "user__email")
    autocomplete_fields = ("user",)

@admin.register(FantasyPlayerSelection)
class FantasyPlayerSelectionAdmin(admin.ModelAdmin):
    list_display = ("id", "fantasy_team", "player", "is_starter", "is_captain")
    list_filter = ("is_starter", "is_captain")
    search_fields = ("fantasy_team__name", "player__first_name", "player__last_name")
    autocomplete_fields = ("fantasy_team", "player")


@admin.register(FantasyGroup)
class FantasyGroupAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "invite_code", "owner", "created_at")
    search_fields = ("name", "invite_code", "owner__email")
    autocomplete_fields = ("owner",)


@admin.register(FantasyGroupMembership)
class FantasyGroupMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "user", "created_at")
    search_fields = ("group__name", "user__email")
    autocomplete_fields = ("group", "user")


@admin.register(FantasyPoints)
class FantasyPointsAdmin(admin.ModelAdmin):
    list_display = ("id", "match", "player", "points", "calculated_at")
    list_filter = ("match",)
    search_fields = ("player__first_name", "player__last_name")
    autocomplete_fields = ("match", "player")
    readonly_fields = ("calculated_at", "breakdown")


@admin.register(FantasyPlayerPrice)
class FantasyPlayerPriceAdmin(admin.ModelAdmin):
    list_display = ("player", "price", "updated_at")
    list_editable = ("price",)
    search_fields = (
        "player__first_name",
        "player__last_name",
        "player__display_name",
    )
    autocomplete_fields = ("player",)


from django.contrib import admin

from .models import Match, MatchEvent


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "competition",
        "home_team",
        "away_team",
        "status",
        "home_score",
        "away_score",
        "kickoff_at",
    )
    list_filter = ("status", "competition")
    search_fields = (
        "home_team__name",
        "away_team__name",
        "competition__name",
    )
    autocomplete_fields = ("competition", "home_team", "away_team")
    readonly_fields = (
        "home_score",
        "away_score",
        "created_at",
        "updated_at",
    )


@admin.register(MatchEvent)
class MatchEventAdmin(admin.ModelAdmin):
    list_display = ("id", "match", "type", "minute", "team", "player")
    list_filter = ("type",)
    search_fields = ("match__home_team__name", "match__away_team__name", "description")
    autocomplete_fields = ("match", "team", "player", "related_player")
    readonly_fields = ("created_at",)
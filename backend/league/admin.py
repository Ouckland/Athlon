from django.contrib import admin

from .models import Competition, Organization, Player, Team


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "season", "status", "start_date", "end_date")
    list_filter = ("status", "organization")
    search_fields = ("name", "slug", "season", "organization__name")
    autocomplete_fields = ("organization",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "short_name", "organization", "captain")
    list_filter = ("organization",)
    search_fields = ("name", "slug", "short_name", "organization__name")
    autocomplete_fields = ("organization", "captain")
    filter_horizontal = ("competitions",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("__str__", "team", "position", "shirt_number", "user")
    list_filter = ("position", "team__organization")
    search_fields = ("first_name", "last_name", "display_name", "team__name")
    autocomplete_fields = ("team", "user")
    readonly_fields = ("created_at", "updated_at")
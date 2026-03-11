"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { signOut, useSession } from "next-auth/react";
import { LogOut, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { cn } from "../../../lib/utils";

export function ProfileDropdown() {
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);

  const name = session?.user?.name ?? "User";
  const email = session?.user?.email ?? "";
  const image = session?.user?.image ?? "";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-xl border transition-all outline-none",
            open
              ? "bg-[#1a1a1a] border-white/10"
              : "bg-transparent border-transparent hover:bg-[#1a1a1a] hover:border-white/10"
          )}
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={image} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="text-[13px] font-medium text-white/80 max-w-[120px] truncate hidden sm:block">
            {name}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-white/40 transition-transform hidden sm:block",
              open && "rotate-180"
            )}
          />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-56 overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl",
            "bg-[#111] p-1.5",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2"
          )}
        >
          {/* User info header */}
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={image} alt={name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{name}</p>
              <p className="text-[11px] text-white/40 truncate">{email}</p>
            </div>
          </div>

          <div className="h-px bg-white/[0.06] mx-1 mb-1" />

          {/* Sign out */}
          <DropdownMenuPrimitive.Item
            onSelect={() => signOut({ callbackUrl: "/" })}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] cursor-pointer outline-none transition-colors",
              "text-red-400 hover:bg-red-500/10 hover:text-red-300"
            )}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

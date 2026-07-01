import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthPage } from "../pages/AuthPage";
import { useAuth } from "../store/auth";

describe("AuthPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.setState({ user: null, initializing: false });
  });

  it("switches between sign in and account creation", () => {
    render(<AuthPage />);
    expect(screen.getByRole("heading", { name: "Sign in to focus." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("heading", { name: "Create your account." })).toBeInTheDocument();
  });

  it("requires a valid email and an eight-character password", () => {
    render(<AuthPage />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
  });
});

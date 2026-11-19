"use client";
import { useState } from "react";
import { Field } from "./shared";
export default function AccountNameFields({
  name,
  onChange,
  disabled = false,
  initialFirstName,
  initialLastName,
}: {
  name: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  initialFirstName?: string;
  initialLastName?: string;
}) {
  const [first, setFirst] = useState(
      initialFirstName || name.split(" ")[0] || "",
    ),
    [last, setLast] = useState(
      initialLastName || name.split(" ").slice(1).join(" "),
    );

  return (
    <>
      <Field label="First name">
        <input
          name="firstName"
          autoComplete="given-name"
          required
          disabled={disabled}
          maxLength={75}
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
            onChange(e.target.value + " " + last);
          }}
        />
      </Field>
      <Field label="Last name">
        <input
          name="lastName"
          autoComplete="family-name"
          required
          disabled={disabled}
          maxLength={75}
          value={last}
          onChange={(e) => {
            setLast(e.target.value);
            onChange(first + " " + e.target.value);
          }}
        />
      </Field>
    </>
  );
}

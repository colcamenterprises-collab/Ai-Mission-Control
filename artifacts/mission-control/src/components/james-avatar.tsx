import { useState } from "react";
import { Bot } from "lucide-react";
import { jamesIdentity } from "@/lib/agent-identities";
import { cn } from "@/lib/utils";

type JamesAvatarProps = {
  className?: string;
  fallbackClassName?: string;
};

export function JamesAvatar({ className, fallbackClassName }: JamesAvatarProps) {
  const [didAvatarFail, setDidAvatarFail] = useState(false);

  if (didAvatarFail) {
    return <Bot aria-hidden="true" className={cn(className, fallbackClassName)} />;
  }

  return (
    <img
      src={jamesIdentity.avatar}
      alt=""
      className={className}
      onError={() => setDidAvatarFail(true)}
    />
  );
}

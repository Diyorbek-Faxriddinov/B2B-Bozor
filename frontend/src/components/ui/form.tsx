import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-border-strong bg-surface text-fg placeholder:text-fg-subtle transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leftIcon, rightSlot, inputSize = 'md', ...props },
  ref,
) {
  const h = inputSize === 'sm' ? 'h-8 text-sm' : inputSize === 'lg' ? 'h-12 text-base' : 'h-10 text-sm';
  return (
    <div className="relative w-full">
      {leftIcon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle [&_svg]:size-4">{leftIcon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, h, 'px-3', leftIcon && 'pl-9', rightSlot && 'pr-10', className)}
        {...props}
      />
      {rightSlot && <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{rightSlot}</span>}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'rightSlot'>>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <Input
      ref={ref}
      type={show ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:text-fg"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'min-h-24 px-3 py-2 text-sm', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; selectSize?: 'sm' | 'md' }>(
  function Select({ className, invalid, children, selectSize = 'md', ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(control, selectSize === 'sm' ? 'h-8 text-sm' : 'h-10 text-sm', 'appearance-none pr-9 pl-3', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
      </div>
    );
  },
);

export function Label({ className, children, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('mb-1.5 block text-sm font-medium text-fg', className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}

/** Label + control + hint/error. The child receives the generated id via render prop or uses `htmlFor` manually. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  id: idProp,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  id?: string;
  children: ReactNode | ((id: string) => ReactNode);
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }>(function Checkbox(
  { label, className, ...props },
  ref,
) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg select-none', className)}>
      <input ref={ref} type="checkbox" className="size-4 shrink-0 cursor-pointer rounded border-border-strong accent-primary" {...props} />
      {label}
    </label>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start justify-between gap-4', disabled ? 'opacity-60' : 'cursor-pointer')}>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium text-fg">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-fg-subtle">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-3')}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function RadioCard({
  checked,
  onSelect,
  icon,
  title,
  description,
  className,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all disabled:opacity-50',
        checked ? 'border-primary bg-primary-soft/60 ring-3 ring-primary/10' : 'border-border-strong bg-surface hover:border-fg-subtle',
        className,
      )}
    >
      {icon && (
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5', checked ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted')}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
      <span className={cn('mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-primary' : 'border-border-strong')}>
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

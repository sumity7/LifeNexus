import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Button, EmptyState, Field, FormError, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFormState } from '../../hooks/useFormState';

function passwordIssue(v) {
  if (!v) return 'Password is required';
  if (v.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number';
  return null;
}

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [submitting, setSubmitting] = useState(false);
  const form = useFormState({ password: '', confirm: '' });
  const { values, errors } = form;

  if (!token) {
    return (
      <AuthLayout title="Reset your password" subtitle="">
        <EmptyState icon={KeyRound} title="This reset link is invalid" description="Request a new one — reset links expire after an hour and can only be used once." />
        <p className="auth__switch">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </AuthLayout>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    const valid = form.validate({
      password: passwordIssue,
      confirm: (v) => (v !== values.password ? 'Passwords do not match' : null),
    });
    if (!valid) return;
    setSubmitting(true);
    form.setFormError(null);
    try {
      await resetPassword({ token, password: values.password });
      toast.success('Password updated', { description: 'Sign in with your new password.' });
      navigate('/login', { replace: true });
    } catch (err) {
      form.handleError(err);
      setSubmitting(false);
    }
  };

  const strength = [values.password.length >= 8, /[A-Za-z]/.test(values.password) && /\d/.test(values.password), values.password.length >= 12 || /[^A-Za-z0-9]/.test(values.password)].filter(Boolean).length;

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password you haven't used before.">
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError error={form.formError} />
        <Field label="New password" error={errors.password} hint="At least 8 characters with a letter and a number">
          <Input type="password" autoComplete="new-password" autoFocus {...form.bind('password')} placeholder="••••••••" maxLength={128} />
        </Field>
        {values.password && (
          <div className="password-strength" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < strength ? `is-on is-${strength}` : ''} />
            ))}
            <span className="text-xs muted">{['Too weak', 'Weak', 'Good', 'Strong'][strength]}</span>
          </div>
        )}
        <Field label="Confirm password" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" {...form.bind('confirm')} placeholder="••••••••" maxLength={128} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block icon={KeyRound} loading={submitting} disabled={submitting}>
          Reset password
        </Button>
      </form>
      <p className="auth__switch">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

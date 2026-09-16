import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Button, EmptyState, Field, FormError, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useFormState({ email: '' });
  const { values, errors } = form;

  const onSubmit = async (e) => {
    e.preventDefault();
    const valid = form.validate({
      email: (v) => (!v.trim() ? 'Email is required' : !/^\S+@\S+\.\S+$/.test(v) ? 'Enter a valid email' : null),
    });
    if (!valid) return;
    setSubmitting(true);
    form.setFormError(null);
    try {
      await forgotPassword(values.email.trim());
      // Always shown, whether or not the account exists — never reveal that here either.
      setSent(true);
    } catch (err) {
      form.handleError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="">
        <EmptyState
          icon={MailCheck}
          title="If that account exists, a reset link is on its way"
          description={`We've sent instructions to ${values.email.trim()}. The link expires in 1 hour. If it doesn't arrive soon, check spam, or try again.`}
        />
        <p className="auth__switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a link to reset it.">
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError error={form.formError} />
        <Field label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" autoFocus {...form.bind('email')} placeholder="you@example.com" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block icon={Mail} loading={submitting} disabled={submitting}>
          Send reset link
        </Button>
      </form>
      <p className="auth__switch">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

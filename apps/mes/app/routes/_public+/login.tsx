import {
  AUTH_PROVIDERS,
  assertIsPost,
  CarbonEdition,
  CONTROLLED_ENVIRONMENT,
  carbonClient,
  emailAndPasswordValidator,
  error,
  RATE_LIMIT,
  safeRedirect
} from "@carbon/auth";
import { signInWithEmail, verifyAuthSession } from "@carbon/auth/auth.server";
import { setCompanyId } from "@carbon/auth/company.server";
import {
  flash,
  getAuthSession,
  setAuthSession
} from "@carbon/auth/session.server";
import { getUserByEmail } from "@carbon/auth/users.server";
import { Hidden, Input, Submit, ValidatedForm, validator } from "@carbon/form";
import { redis } from "@carbon/kv";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  toast,
  VStack
} from "@carbon/react";
import { ItarLoginDisclaimer } from "@carbon/remix";
import { Edition } from "@carbon/utils";
import { Ratelimit } from "@upstash/ratelimit";
import { useEffect } from "react";
import { LuCircleAlert } from "react-icons/lu";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction
} from "react-router";
import {
  data,
  redirect,
  useFetcher,
  useLoaderData,
  useSearchParams
} from "react-router";
import { z } from "zod";

import { path } from "~/utils/path";

export const meta: MetaFunction = () => {
  return [{ title: "Carbon | Login" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const authSession = await getAuthSession(request);
  if (authSession && (await verifyAuthSession(authSession))) {
    throw redirect(path.to.authenticatedRoot);
  }

  const providers = AUTH_PROVIDERS.split(",");

  return {
    providers
  };
}

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT, "1 h"),
  analytics: true
});

const passwordLoginValidator = emailAndPasswordValidator.extend({
  redirectTo: z.string().optional()
});

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return data(
      error(null, "Rate limit exceeded"),
      await flash(request, error(null, "Rate limit exceeded"))
    );
  }

  const validation = await validator(passwordLoginValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return data(
      error(validation.error, "Invalid login"),
      await flash(request, error(validation.error, "Invalid login"))
    );
  }

  const { email, password, redirectTo } = validation.data;

  // Manteniamo la logica originale: login permesso solo se esiste un record user attivo lato Carbon.
  // (auth.users -> public.user è gestito dai trigger DB)
  const user = await getUserByEmail(email);

  if (!user.data || !user.data.active) {
    return data(
      { success: false, message: "Invalid email/password combination" },
      await flash(request, error(null, "Failed to sign in"))
    );
  }

  const authSession = await signInWithEmail(email, password);

  if (!authSession) {
    return data(
      { success: false, message: "Invalid email/password combination" },
      await flash(request, error(null, "Failed to sign in"))
    );
  }

  const sessionCookie = await setAuthSession(request, { authSession });
  const companyIdCookie = setCompanyId(authSession.companyId);

  return data(
    {
      success: true,
      redirectTo: safeRedirect(redirectTo)
    },
    {
      headers: [
        ["Set-Cookie", sessionCookie],
        ["Set-Cookie", companyIdCookie]
      ]
    }
  );
}

export default function LoginRoute() {
  const { providers } = useLoaderData<typeof loader>();
  const hasOutlookAuth = providers.includes("azure");
  const hasGoogleAuth = providers.includes("google");

  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? undefined;

  const fetcher = useFetcher<
    { success: true; redirectTo: string } | { success: false; message: string }
  >();

  useEffect(() => {
    if (fetcher.data?.success === true) {
      // I cookie di sessione sono già impostati dalla risposta (Set-Cookie). Ora navighiamo.
      window.location.assign(fetcher.data.redirectTo);
    }
  }, [fetcher.data]);

  const onSignInWithGoogle = async () => {
    const { error } = await carbonClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback${
          redirectTo ? `?redirectTo=${redirectTo}` : ""
        }`
      }
    });

    if (error) {
      toast.error(error.message);
    }
  };

  const onSignInWithAzure = async () => {
    const { error } = await carbonClient.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email",
        redirectTo: `${window.location.origin}/callback${
          redirectTo ? `?redirectTo=${redirectTo}` : ""
        }`
      }
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <div className="flex justify-center mb-4">
        <img
          src={CONTROLLED_ENVIRONMENT ? "/flag.png" : "/carbon-logo-mark.svg"}
          alt="Carbon Logo"
          className="w-36"
        />
      </div>

      <div className="rounded-lg md:bg-card md:border md:border-border md:shadow-lg p-8 w-[380px]">
        <ValidatedForm
          fetcher={fetcher}
          validator={passwordLoginValidator}
          defaultValues={{ redirectTo }}
          method="post"
        >
          <Hidden name="redirectTo" value={redirectTo} type="hidden" />

          <VStack spacing={2}>
            {fetcher.data?.success === false && fetcher.data?.message && (
              <Alert variant="destructive">
                <LuCircleAlert className="w-4 h-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>{fetcher.data?.message}</AlertDescription>
              </Alert>
            )}

            <Input
              name="email"
              label=""
              placeholder="Email Address"
              autoComplete="username"
            />

            <Input
              name="password"
              type="password"
              label=""
              placeholder="Password"
              autoComplete="current-password"
            />

            <Submit
              isDisabled={fetcher.state !== "idle"}
              isLoading={fetcher.state === "submitting"}
              size="lg"
              className="w-full"
              withBlocker={false}
            >
              Sign in
            </Submit>

            {hasGoogleAuth && (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={onSignInWithGoogle}
                isDisabled={fetcher.state !== "idle"}
                variant="secondary"
                leftIcon={<GoogleIcon />}
              >
                Sign in with Google
              </Button>
            )}

            {hasOutlookAuth && (
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={onSignInWithAzure}
                isDisabled={fetcher.state !== "idle"}
                variant="secondary"
                leftIcon={<OutlookIcon className="size-6" />}
              >
                Sign in with Outlook
              </Button>
            )}
          </VStack>
        </ValidatedForm>
      </div>

      <div className="flex flex-col gap-4 text-sm text-center text-balance text-muted-foreground w-[380px]">
        {CONTROLLED_ENVIRONMENT && <ItarLoginDisclaimer />}
        {CarbonEdition !== Edition.Community && (
          <p>
            By signing in, you agree to the{" "}
            <a
              href="https://carbon.ms/terms"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://carbon.ms/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Privacy Policy.
            </a>
          </p>
        )}
      </div>
    </>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      height="16"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      width="16"
      {...props}
    >
      <path
        d="M8.15991 6.54543V9.64362H12.4654C12.2763 10.64 11.709 11.4837 10.8581 12.0509L13.4544 14.0655C14.9671 12.6692 15.8399 10.6182 15.8399 8.18188C15.8399 7.61461 15.789 7.06911 15.6944 6.54552L8.15991 6.54543Z"
        fill="#4285F4"
      ></path>
      <path
        d="M3.6764 9.52268L3.09083 9.97093L1.01807 11.5855C2.33443 14.1963 5.03241 16 8.15966 16C10.3196 16 12.1305 15.2873 13.4542 14.0655L10.8578 12.0509C10.1451 12.5309 9.23598 12.8219 8.15966 12.8219C6.07967 12.8219 4.31245 11.4182 3.67967 9.5273L3.6764 9.52268Z"
        fill="#34A853"
      ></path>
      <path
        d="M1.01803 4.41455C0.472607 5.49087 0.159912 6.70543 0.159912 7.99995C0.159912 9.29447 0.472607 10.509 1.01803 11.5854C1.01803 11.5926 3.6799 9.51991 3.6799 9.51991C3.5199 9.03991 3.42532 8.53085 3.42532 7.99987C3.42532 7.46889 3.5199 6.95983 3.6799 6.47983L1.01803 4.41455Z"
        fill="#FBBC05"
      ></path>
      <path
        d="M8.15982 3.18545C9.33802 3.18545 10.3853 3.59271 11.2216 4.37818L13.5125 2.0873C12.1234 0.792777 10.3199 0 8.15982 0C5.03257 0 2.33443 1.79636 1.01807 4.41455L3.67985 6.48001C4.31254 4.58908 6.07983 3.18545 8.15982 3.18545Z"
        fill="#EA4335"
      ></path>
    </svg>
  );
}

function OutlookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24"
      width="24"
      viewBox="-274.66275 -425.834 2380.4105 2555.004"
      {...props}
    >
      <path
        d="M1831.083 894.25a40.879 40.879 0 00-19.503-35.131h-.213l-.767-.426-634.492-375.585a86.175 86.175 0 00-8.517-5.067 85.17 85.17 0 00-78.098 0 86.37 86.37 0 00-8.517 5.067l-634.49 375.585-.766.426c-19.392 12.059-25.337 37.556-13.278 56.948a41.346 41.346 0 0014.257 13.868l634.492 375.585a95.617 95.617 0 008.517 5.068 85.17 85.17 0 0078.098 0 95.52 95.52 0 008.517-5.068l634.492-375.585a40.84 40.84 0 0020.268-35.685z"
        fill="#0A2767"
      />
      {/* ... (resto identico al file originale) ... */}
    </svg>
  );
}

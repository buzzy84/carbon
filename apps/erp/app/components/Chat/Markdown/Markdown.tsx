import { getAppUrl } from "@carbon/auth";
import { CodeBlock } from "@carbon/react";
import { Link } from "@remix-run/react";
import { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { allowedHTMLElements, rehypePlugins, remarkPlugins } from "./utils";

type MarkdownProps = {
  children: string;
  html?: boolean;
  limitedMarkdown?: boolean;
};

export const Markdown = memo(
  ({ children, html = false, limitedMarkdown = false }: MarkdownProps) => {
    const components = useMemo(() => {
      return {
        a: (props) => {
          const { children, node, href, ...rest } = props;
          if (href?.startsWith("/")) {
            return (
              <Link
                {...rest}
                to={href}
                className="text-blue-700 dark:text-blue-400 font-bold underline"
              >
                {children}
              </Link>
            );
          }

          if (href?.startsWith(getAppUrl())) {
            return (
              <Link
                {...rest}
                to={href?.replace(getAppUrl(), "")}
                className="text-blue-700 dark:text-blue-400 font-bold underline"
              >
                {children}
              </Link>
            );
          }

          return (
            <a
              {...rest}
              className="text-blue-700 dark:text-blue-400 font-bold underline"
            >
              {children}
            </a>
          );
        },

        pre: (props) => {
          const { children, node, ...rest } = props;

          const [firstChild] = node?.children ?? [];

          if (
            firstChild &&
            firstChild.type === "element" &&
            firstChild.tagName === "code" &&
            firstChild.children?.[0]?.type === "text"
          ) {
            // @ts-ignore
            const { className } = firstChild.properties;
            const [, language = "plaintext"] =
              /language-(\w+)/.exec(String(className) || "") ?? [];

            return <CodeBlock className={language}>{children}</CodeBlock>;
          }

          return <pre {...rest}>{children}</pre>;
        },
      } satisfies Components;
    }, []);

    return (
      <ReactMarkdown
        allowedElements={allowedHTMLElements}
        components={components}
        remarkPlugins={remarkPlugins(limitedMarkdown)}
        rehypePlugins={rehypePlugins(html)}
      >
        {children}
      </ReactMarkdown>
    );
  }
);
Markdown.displayName = "Markdown";
